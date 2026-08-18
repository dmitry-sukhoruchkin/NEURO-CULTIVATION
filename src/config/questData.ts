export interface QuestTarget {
  id: string;
  name: string;
  description: string;
  text: string;
}

export interface QuestConfig {
  title: string;
  dimensionality: number;
  targets: QuestTarget[];
}

const DIMENSIONALITY = 768; 

export const ACTIVE_QUEST: QuestConfig = {
  title: "HEAVENLY DAO CULTIVATION ALCHEMY",
  dimensionality: DIMENSIONALITY,
  targets: [
    {
      id: "void",
      name: "PRIMORDIAL VOID",
      description: "Initial meditation state. Silent, formless, still.",
      text: "Stillness deep meditation absolute calm, empty infinite dark black void, completely silent."
    },
    {
      id: "fire_core",
      name: "HEAVENLY FLAME CORE",
      description: "Aggressive tribulation fire refining the Spirit.",
      text: "Roaring heavenly fire flame, exploding violent detonation blast, perfect round radiant golden core."
    },
    {
      id: "demonic_abyss",
      name: "NINE NETHER ABYSS",
      description: "Sinking into chaotic demonic aura and blood essence.",
      text: "Sinking descending to abyss, dark chaotic demonic aura, pulsing red blood essence, destructive spatial tear."
    },
    {
      id: "sword_domain",
      name: "SUPREME SWORD DOMAIN",
      description: "Expanding piercing metallic intent across the array.",
      text: "Sharp piercing sword intent slash, metallic spiritual iron, expanding domain aura outward, complex arcane fractal formation array."
    },
     {
      id: "jade_ascension",
      name: "JADE BONE ASCENSION",
      description: "Rising spiritual form, flawless crystalline body.",
      text: "Translucent polished jade skeleton, flowing pure spiritual water, ascending flying to heavens, pure glowing Daoist Qi energy."
    }
  ],
};
