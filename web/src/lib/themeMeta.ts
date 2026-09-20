// web/src/lib/themeMeta.ts
export type ThemeKey =
  | "CULTURE_CLASSIQUE"
  | "CULTURE_GENERALE"
  | "CULTURE_MODERNE"
  | "GEOGRAPHIE"
  | "HISTOIRE"
  | "MUSIQUE"
  | "NATURE"
  | "SCIENCE"
  | "SPORT"
  | "TRADITION"


export type ThemeMeta = { label: string; color: string };

export const THEME_META: Record<string, ThemeMeta> = {
  CULTURE_CLASSIQUE: { label: "Culture classique", color: "#B889F0" },
  CULTURE_GENERALE:  { label: "Culture générale",  color: "#6D86E8" },
  CULTURE_MODERNE:   { label: "Culture moderne",   color: "#A970FF" },
  GEOGRAPHIE:      { label: "Géographie",     color: "#4DB8E4" },
  HISTOIRE:        { label: "Histoire",       color: "#BEC7DA" },
  MUSIQUE:         { label: "Musique",        color: "#D066B8" },
  NATURE:          { label: "Nature",         color: "#69C8A5" },
  SCIENCE:         { label: "Science",        color: "#D87AA8" },
  SPORT:           { label: "Sport",          color: "#7CC4D8" },
  TRADITION:       { label: "Tradition",      color: "#C47ACB" },
};

export function getThemeMeta(theme?: string | null): ThemeMeta {
  if (!theme) return THEME_META.CULTURE_GENERALE;
  return THEME_META[theme] ?? THEME_META[(theme || "").toUpperCase()] ?? THEME_META.CULTURE_GENERALE;
}