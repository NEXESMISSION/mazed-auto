import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { log } from "@/lib/log";
import { factsForPrompt, type ListingFacts } from "./facts";
import type { Draft, Language } from "./templates";
import type { SocialNetwork } from "./utm";

/**
 * The post written by a model (D-S1: Claude, Haiku 5.5 by default — the model
 * is a setting, `SOCIAL_AI_MODEL`). OFF unless `ANTHROPIC_API_KEY` is set.
 *
 * The model sees the annonce's facts and nothing else, is told not to add
 * any, and answers in a fixed shape (structured output). What it returns is
 * still checked by `checkFacts()` before anyone sees it — the instruction is
 * the first barrier, not the only one. Any failure here (no key, refusal,
 * network, bad shape) returns null and the caller uses the template.
 */

const Output = z.object({
  body: z.string(),
  hashtags: z.array(z.string()),
});

const SYSTEM = `Tu écris des publications de réseaux sociaux pour des annonces automobiles publiées sur Mazed Auto, en Tunisie.

Règles absolues :
- N'utilise QUE les informations de l'annonce fournies. N'ajoute aucun équipement, aucune option, aucun état, aucun historique, aucune garantie, aucun financement, aucune livraison qui n'y figure pas.
- N'écris aucun nombre qui ne figure pas exactement dans les informations (pas d'arrondi, pas d'estimation, pas de « moins de », pas de numéro de téléphone).
- N'écris pas de lien : il est ajouté ensuite.
- Pas de superlatif sur l'état du véhicule (« impeccable », « comme neuf »…) sauf si l'état fourni le dit.
- Ton commercial, clair et honnête ; quelques émojis au plus.
- Les hashtags se construisent uniquement à partir des informations (marque, modèle, ville, type), sans chiffre inventé, et commencent par #. Inclure #MazedAuto.`;

function instructions(network: SocialNetwork, lang: Language): string {
  const language = lang === "tn"
    ? "Écris en dialecte tunisien (derja), en écriture arabe."
    : "Écris en français.";
  const shape = network === "facebook"
    ? "Publication Facebook : 3 à 6 lignes, puis une phrase qui invite à voir l'annonce sur Mazed Auto. 3 hashtags au plus."
    : "Légende Instagram : 2 à 4 lignes courtes ; termine par « Détails sur Mazed Auto » suivi de la référence de l'annonce si elle est fournie. 5 à 10 hashtags.";
  return `${language}\n${shape}`;
}

export function isAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

export const aiModel = () => process.env.SOCIAL_AI_MODEL?.trim() || "claude-haiku-5-5";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  // Reads ANTHROPIC_API_KEY, and ANTHROPIC_BASE_URL when set (the local test
  // stand-in uses it). Short answers: a tight timeout, the SDK's own retries.
  client ??= new Anthropic({ timeout: 30_000, maxRetries: 2 });
  return client;
}

/**
 * One draft from the model, or null. `correction` is used for the single
 * retry after a check failure: it names the numbers that were not allowed.
 */
export async function aiDraft(
  facts: ListingFacts,
  network: SocialNetwork,
  lang: Language,
  correction?: string[],
): Promise<Draft | null> {
  if (!isAiConfigured()) return null;
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `${instructions(network, lang)}\n\nInformations de l'annonce :\n${factsForPrompt(facts)}` },
  ];
  if (correction?.length) {
    messages[0] = {
      role: "user",
      content: `${messages[0].content as string}\n\nUne version précédente contenait des nombres absents des informations (${correction.join(", ")}). Réécris sans aucun de ces nombres.`,
    };
  }
  try {
    const response = await anthropic().messages.parse({
      model: aiModel(),
      max_tokens: 4000,
      system: SYSTEM,
      // Short marketing copy: the lowest effort is enough, and the cheapest.
      output_config: { effort: "low", format: zodOutputFormat(Output) },
      messages,
    });
    if (response.stop_reason === "refusal") {
      log.scope("social").warn("ai draft refused", { category: response.stop_details?.category ?? null });
      return null;
    }
    const out = response.parsed_output;
    if (!out?.body?.trim()) return null;
    const hashtags = out.hashtags
      .map((h) => `#${h.replace(/^#+/, "").replace(/\s+/g, "")}`)
      .filter((h) => h.length > 2)
      .slice(0, network === "instagram" ? 15 : 3);
    return { body: out.body.trim().slice(0, 2000), hashtags };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      log.scope("social").warn("ai draft rate limited");
    } else if (error instanceof Anthropic.APIError) {
      log.scope("social").error(`ai draft failed (${error.status})`, { message: error.message });
    } else {
      log.scope("social").error("ai draft failed", { message: (error as Error).message });
    }
    return null;
  }
}
