import { aiDraft, aiModel, isAiConfigured } from "./ai";
import { checkFacts, type ListingFacts } from "./facts";
import { templateDraft, type Draft, type Language } from "./templates";
import type { SocialNetwork } from "./utm";

export type Generated = {
  draft: Draft;
  source: "ai" | "template";
  model: string | null;
  /** Said to the person when the text is not what they asked for. */
  note: string | null;
};

/**
 * One draft for one network. The model when the shop's plan allows it and a
 * key is set; its text is checked against the annonce, given ONE chance to
 * correct itself, and replaced by the template if it still cites a number the
 * annonce does not contain. The template is the floor: it always exists and
 * always passes the check.
 */
export async function generateDraft(
  facts: ListingFacts,
  network: SocialNetwork,
  lang: Language,
  allowAi: boolean,
): Promise<Generated> {
  const fallback = (note: string | null): Generated => ({ draft: templateDraft(facts, network, lang), source: "template", model: null, note });
  if (!allowAi) return fallback(null);
  if (!isAiConfigured()) return fallback(null);

  const first = await aiDraft(facts, network, lang);
  if (!first) return fallback("La rédaction automatique n'a pas répondu : voici le texte standard, modifiable.");
  const check = checkFacts(first.body, first.hashtags, facts);
  if (check.ok) return { draft: first, source: "ai", model: aiModel(), note: null };

  const second = await aiDraft(facts, network, lang, check.unknown);
  if (second && checkFacts(second.body, second.hashtags, facts).ok) {
    return { draft: second, source: "ai", model: aiModel(), note: null };
  }
  return fallback(`Le texte rédigé citait des chiffres absents de l'annonce (${check.unknown.join(", ")}) : il a été remplacé par le texte standard.`);
}
