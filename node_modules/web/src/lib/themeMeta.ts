// web/src/lib/themeMeta.ts
export type ThemeKey =
  | "ARTS"
  | "AUDIOVISUEL"
  | "CROYANCES"
  | "DIVERS"
  | "GEOGRAPHIE"
  | "HISTOIRE"
  | "LITTERATURE"
  | "MUSIQUE"
  | "NATURE"
  | "POP_CULTURE"
  | "SCIENCE"
  | "SOCIETE"
  | "SPORT"
  | "TRADITIONS"


export type ThemeMeta = { label: string; color: string };

export const THEME_META: Record<string, ThemeMeta> = {
  AUDIOVISUEL:     { label: "Audiovisuel",    color: "#42B8A7" },
  ARTS:            { label: "Arts",           color: "#B889F0" },
  CROYANCES:       { label: "Croyances",      color: "#8E8FE8" },
  DIVERS:          { label: "Divers",         color: "#9EA8BF" },
  GEOGRAPHIE:      { label: "Géographie",     color: "#4DB8E4" },
  HISTOIRE:        { label: "Histoire",       color: "#BEC7DA" },
  LITTERATURE:     { label: "Littérature",    color: "#B65ACB" },
  MUSIQUE:         { label: "Musique",        color: "#D066B8" },
  NATURE:          { label: "Nature",         color: "#69C8A5" },
  POP_CULTURE:     { label: "Pop culture",    color: "#A970FF" },
  SCIENCE:         { label: "Science",        color: "#D87AA8" },
  SOCIETE:         { label: "Société",        color: "#6D86E8" },
  SPORT:           { label: "Sport",          color: "#7CC4D8" },
  TRADITIONS:      { label: "Traditions",     color: "#C47ACB" },
};

export function getThemeMeta(theme?: string | null): ThemeMeta {
  if (!theme) return THEME_META.DIVERS;
  return THEME_META[theme] ?? THEME_META[(theme || "").toUpperCase()] ?? THEME_META.DIVERS;
}