
import { PonderNoun } from "./types";
import { getGoldskyNounById } from "@/data/goldsky/nouns";

export async function getNounById(id: string): Promise<PonderNoun | null> {
  try {
    return (await getGoldskyNounById(id)) ?? null;
  } catch (error) {
    console.error('Failed to fetch noun by ID from Goldsky:', error);
    return null;
  }
}
