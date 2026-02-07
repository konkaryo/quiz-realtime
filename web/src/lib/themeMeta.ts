// web/src/lib/themeMeta.ts
export type ThemeKey =
  | "ARTS"
  | "AUDIOVISUEL"
  | "CROYANCES"
  | "DIVERS"
  | "GASTRONOMIE"
  | "GEOGRAPHIE"
  | "HISTOIRE"
  | "LITTERATURE"
  | "MUSIQUE"
  | "NATURE"
  | "POP_CULTURE"
  | "SCIENCE"
  | "SOCIETE"
  | "SPORT"


export type ThemeMeta = { label: string; color: string };

export const THEME_META: Record<string, ThemeMeta> = {
  AUDIOVISUEL:     { label: "Audiovisuel",    color: "#14B8A6" },
  ARTS:            { label: "Arts",           color: "#F59E0B" },
  CROYANCES:       { label: "Croyances",      color: "#818CF8" },
  DIVERS:          { label: "Divers",         color: "#A3A3A3" },
  GASTRONOMIE:     { label: "Gastronomie",    color: "#F97316" },
  GEOGRAPHIE:      { label: "Géographie",     color: "#22D3EE" },
  HISTOIRE:        { label: "Histoire",       color: "#FAFAFA" },
  LITTERATURE:     { label: "Littérature",    color: "#D946EF" },
  MUSIQUE:         { label: "Musique",        color: "#EC4899" },
  NATURE:          { label: "Nature",         color: "#22C55E" },
  POP_CULTURE:     { label: "Pop culture",    color: "#EAB308" },
  SCIENCE:         { label: "Science",        color: "#EF4444" },
  SOCIETE:         { label: "Société",        color: "#3B82F6" },
  SPORT:           { label: "Sport",          color: "#84CC16" },
};

export function getThemeMeta(theme?: string | null): ThemeMeta {
  if (!theme) return THEME_META.DIVERS;
  return THEME_META[theme] ?? THEME_META[(theme || "").toUpperCase()] ?? THEME_META.DIVERS;
}