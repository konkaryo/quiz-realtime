// web/src/lib/themeMeta.ts
export type ThemeKey =
  | "CINEMA_SERIES"
  | "ARTS_CULTURE"
  | "JEUX_BD"
  | "GEOGRAPHIE"
  | "LANGUES_LITTERATURE"
  | "ECONOMIE_POLITIQUE"
  | "GASTRONOMIE"
  | "CROYANCES"
  | "SPORT"
  | "HISTOIRE"
  | "DIVERS"
  | "SCIENCES_NATURELLES"
  | "SCIENCES_TECHNIQUES"
  | "MUSIQUE"
  | "ACTUALITES_MEDIAS";

export type ThemeMeta = { label: string; color: string };

export const THEME_META: Record<string, ThemeMeta> = {
  CINEMA_SERIES:       { label: "Cinéma & Séries",        color: "#14B8A6" },
  ARTS_CULTURE:        { label: "Arts & Culture",         color: "#F59E0B" },
  JEUX_BD:             { label: "Jeux & BD",              color: "#EAB308" },
  GEOGRAPHIE:          { label: "Géographie",             color: "#22D3EE" },
  LANGUES_LITTERATURE: { label: "Langues & Littérature",  color: "#D946EF" },
  ECONOMIE_POLITIQUE:  { label: "Économie & Politique",   color: "#3B82F6" },
  GASTRONOMIE:         { label: "Gastronomie",            color: "#F97316" },
  CROYANCES:           { label: "Croyances",              color: "#818CF8" },
  SPORT:               { label: "Sport",                  color: "#84CC16" },
  HISTOIRE:            { label: "Histoire",               color: "#FAFAFA" },
  DIVERS:              { label: "Divers",                 color: "#A3A3A3" },
  SCIENCES_NATURELLES: { label: "Sciences naturelles",    color: "#22C55E" },
  SCIENCES_TECHNIQUES: { label: "Sciences & Techniques",  color: "#EF4444" },
  MUSIQUE:             { label: "Musique",                color: "#EC4899" },
  ACTUALITES_MEDIAS:   { label: "Actualités & Médias",    color: "#F43F5E" },
};

export function getThemeMeta(theme?: string | null): ThemeMeta {
  if (!theme) return THEME_META.DIVERS;
  return THEME_META[theme] ?? THEME_META[(theme || "").toUpperCase()] ?? THEME_META.DIVERS;
}