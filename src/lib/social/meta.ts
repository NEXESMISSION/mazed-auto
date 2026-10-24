/**
 * Meta Graph API — Facebook Pages and Instagram professional accounts, through
 * Facebook Login (D-S2).
 *
 * OFF unless META_APP_ID and META_APP_SECRET are set. Until the Meta app has
 * passed App Review, only people with a role on the app (MAZED, pilot shops
 * added as testers) can connect their Pages — the code is the same either way.
 * META_GRAPH_URL / META_DIALOG_URL point at Meta by default and at the local
 * stand-in in tests; META_GRAPH_VERSION pins the API version.
 *
 * ERRORS are sorted by what the caller must do next, not by what Meta said:
 *   token      the token is expired or revoked → the shop reconnects
 *   rate       Meta is throttling → try again later
 *   rejected   Meta refused this content for good → fix it, do not retry blindly
 *   transient  a read failed in passing → retry
 *   ambiguous  the FINAL publishing call failed in a way that does not say
 *              whether the post exists (timeout, network, 5xx) → ask Meta
 *              before any new attempt (brief §5), never just resend.
 */

export type MetaConfig = {
  appId: string;
  appSecret: string;
  graph: string;
  dialog: string;
  version: string;
  scopes: string[];
};

const DEFAULT_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
];

export function metaConfig(): MetaConfig | null {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;
  const version = process.env.META_GRAPH_VERSION?.trim() || "v24.0";
  const base = (process.env.META_GRAPH_URL?.trim() || "https://graph.facebook.com").replace(/\/$/, "");
  return {
    appId,
    appSecret,
    version,
    graph: `${base}/${version}`,
    dialog: `${(process.env.META_DIALOG_URL?.trim() || "https://www.facebook.com").replace(/\/$/, "")}/${version}/dialog/oauth`,
    scopes: process.env.META_SCOPES?.split(",").map((s) => s.trim()).filter(Boolean) ?? DEFAULT_SCOPES,
  };
}

export type MetaErrorKind = "token" | "rate" | "rejected" | "transient" | "ambiguous";

export class MetaError extends Error {
  constructor(
    message: string,
    readonly kind: MetaErrorKind,
    readonly status: number | null,
    readonly code: number | null = null,
    readonly subcode: number | null = null,
  ) {
    super(message);
  }
}

const TOKEN_CODES = new Set([102, 190]);
const RATE_CODES = new Set([4, 17, 32, 341, 368, 613]);

/** Classify a Graph error body (pure, tested). */
export function classify(status: number, body: unknown, finalPublish: boolean): MetaError {
  const err = (body as { error?: { message?: string; code?: number; error_subcode?: number } } | null)?.error;
  const code = typeof err?.code === "number" ? err.code : null;
  const sub = typeof err?.error_subcode === "number" ? err.error_subcode : null;
  const msg = err?.message ?? `HTTP ${status}`;
  if (code !== null && TOKEN_CODES.has(code)) return new MetaError(msg, "token", status, code, sub);
  if (status === 429 || (code !== null && RATE_CODES.has(code))) return new MetaError(msg, "rate", status, code, sub);
  if (status >= 500 || status === 0) return new MetaError(msg, finalPublish ? "ambiguous" : "transient", status, code, sub);
  return new MetaError(msg, "rejected", status, code, sub);
}

async function call(
  cfg: MetaConfig,
  method: "GET" | "POST",
  path: string,
  params: Record<string, string>,
  finalPublish = false,
): Promise<Record<string, unknown>> {
  const url = new URL(`${cfg.graph}/${path.replace(/^\//, "")}`);
  let body: URLSearchParams | undefined;
  if (method === "GET") for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  else body = new URLSearchParams(params);
  let res: Response;
  try {
    res = await fetch(url, { method, body, signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    // The request may or may not have reached Meta.
    throw new MetaError((e as Error).message || "network error", finalPublish ? "ambiguous" : "transient", 0);
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok || json?.error) throw classify(res.ok ? 400 : res.status, json, finalPublish);
  return json ?? {};
}

// ── Facebook Login ──────────────────────────────────────────────────────────

export function oauthUrl(cfg: MetaConfig, redirectUri: string, state: string): string {
  const u = new URL(cfg.dialog);
  u.searchParams.set("client_id", cfg.appId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", cfg.scopes.join(","));
  return u.toString();
}

/** The code from the callback → a long-lived user token (about 60 days). */
export async function userTokenFromCode(cfg: MetaConfig, code: string, redirectUri: string): Promise<string> {
  const short = await call(cfg, "GET", "oauth/access_token", {
    client_id: cfg.appId, client_secret: cfg.appSecret, redirect_uri: redirectUri, code,
  });
  const long = await call(cfg, "GET", "oauth/access_token", {
    grant_type: "fb_exchange_token", client_id: cfg.appId, client_secret: cfg.appSecret,
    fb_exchange_token: String(short.access_token ?? ""),
  });
  const token = String(long.access_token ?? short.access_token ?? "");
  if (!token) throw new MetaError("no access token returned", "rejected", 400);
  return token;
}

export type MetaPage = {
  id: string;
  name: string;
  token: string;
  picture: string | null;
  instagram: { id: string; username: string | null; picture: string | null } | null;
};

/** The Pages this person manages, each with its own token (which does not expire when derived from a long-lived user token) and its linked Instagram account. */
export async function listPages(cfg: MetaConfig, userToken: string): Promise<MetaPage[]> {
  const r = await call(cfg, "GET", "me/accounts", {
    access_token: userToken,
    fields: "id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}",
    limit: "100",
  });
  type Raw = {
    id: string; name: string; access_token: string;
    picture?: { data?: { url?: string } };
    instagram_business_account?: { id: string; username?: string; profile_picture_url?: string };
  };
  return ((r.data as Raw[] | undefined) ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    token: p.access_token,
    picture: p.picture?.data?.url ?? null,
    instagram: p.instagram_business_account
      ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username ?? null, picture: p.instagram_business_account.profile_picture_url ?? null }
      : null,
  }));
}

// ── Publishing ──────────────────────────────────────────────────────────────

export type Published = { id: string; url: string | null };

async function permalink(cfg: MetaConfig, id: string, token: string, field: "permalink_url" | "permalink"): Promise<string | null> {
  try {
    const r = await call(cfg, "GET", id, { access_token: token, fields: field });
    return typeof r[field] === "string" ? (r[field] as string) : null;
  } catch {
    return null;
  }
}

/** A Page post: the text with the photos attached. Unpublished photo uploads are harmless if what follows fails; only the final post is ambiguous. */
export async function publishFacebook(
  cfg: MetaConfig,
  pageId: string,
  token: string,
  post: { message: string; imageUrls: string[] },
): Promise<Published> {
  let id: string;
  if (post.imageUrls.length === 1) {
    const r = await call(cfg, "POST", `${pageId}/photos`, { access_token: token, url: post.imageUrls[0], caption: post.message, published: "true" }, true);
    id = String(r.post_id ?? r.id);
  } else {
    const media: string[] = [];
    for (const url of post.imageUrls) {
      const r = await call(cfg, "POST", `${pageId}/photos`, { access_token: token, url, published: "false" });
      media.push(String(r.id));
    }
    const params: Record<string, string> = { access_token: token, message: post.message };
    media.forEach((m, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: m })));
    const r = await call(cfg, "POST", `${pageId}/feed`, params, true);
    id = String(r.id);
  }
  return { id, url: await permalink(cfg, id, token, "permalink_url") };
}

/** An Instagram post: a container (one photo, or a carousel of up to 10), then publish. */
export async function publishInstagram(
  cfg: MetaConfig,
  igId: string,
  token: string,
  post: { caption: string; imageUrls: string[] },
): Promise<Published> {
  if (post.imageUrls.length === 0) throw new MetaError("Instagram needs at least one photo", "rejected", 400);
  let creation: string;
  if (post.imageUrls.length === 1) {
    creation = String((await call(cfg, "POST", `${igId}/media`, { access_token: token, image_url: post.imageUrls[0], caption: post.caption })).id);
  } else {
    const children: string[] = [];
    for (const url of post.imageUrls.slice(0, 10)) {
      children.push(String((await call(cfg, "POST", `${igId}/media`, { access_token: token, image_url: url, is_carousel_item: "true" })).id));
    }
    creation = String((await call(cfg, "POST", `${igId}/media`, {
      access_token: token, media_type: "CAROUSEL", children: children.join(","), caption: post.caption,
    })).id);
  }
  // Meta fetches the photos before the container can be published.
  for (let i = 0; i < 10; i++) {
    const s = await call(cfg, "GET", creation, { access_token: token, fields: "status_code" });
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new MetaError(`container ${String(s.status_code)}`, "rejected", 400);
    await new Promise((r) => setTimeout(r, 1500));
  }
  const r = await call(cfg, "POST", `${igId}/media_publish`, { access_token: token, creation_id: creation }, true);
  const id = String(r.id);
  return { id, url: await permalink(cfg, id, token, "permalink") };
}

// ── After an ambiguous answer ───────────────────────────────────────────────

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** Did the post go out after all? Looks for our exact text among the account's recent posts. */
export async function findRecent(
  cfg: MetaConfig,
  network: "facebook" | "instagram",
  accountId: string,
  token: string,
  text: string,
  since: Date,
): Promise<Published | null> {
  const want = norm(text);
  const floor = since.getTime() - 5 * 60_000;
  if (network === "facebook") {
    const r = await call(cfg, "GET", `${accountId}/published_posts`, { access_token: token, fields: "id,message,created_time,permalink_url", limit: "25" });
    for (const p of (r.data as { id: string; message?: string; created_time?: string; permalink_url?: string }[] | undefined) ?? []) {
      if (p.message && norm(p.message) === want && (!p.created_time || new Date(p.created_time).getTime() >= floor)) {
        return { id: p.id, url: p.permalink_url ?? null };
      }
    }
    return null;
  }
  const r = await call(cfg, "GET", `${accountId}/media`, { access_token: token, fields: "id,caption,timestamp,permalink", limit: "25" });
  for (const m of (r.data as { id: string; caption?: string; timestamp?: string; permalink?: string }[] | undefined) ?? []) {
    if (m.caption && norm(m.caption) === want && (!m.timestamp || new Date(m.timestamp).getTime() >= floor)) {
      return { id: m.id, url: m.permalink ?? null };
    }
  }
  return null;
}
