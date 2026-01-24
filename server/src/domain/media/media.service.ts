
// /server/src/domain/media/media.service.ts
/* ---------------------------------------------------------------------------------------- */
export function toImgUrl(name?: string | null): string | null {
    if (!name) return null;

    if (/^https?:\/\//i.test(name) || name.startsWith("/")) { return name; }

    const cleaned = name
        .replace(/^\.?\/?img\//i, "")
        .replace(/\.(avif|webp|png|jpg|jpeg)$/i, "");

    return `/img/questions/${encodeURIComponent(cleaned)}.avif`;
}
/* ---------------------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------------------- */
export function toProfileUrl(name?: string | null): string | null {
  if (!name || name === "0") { return `/img/profiles/0.avif`; }
  if (/^https?:\/\//i.test(name) || name.startsWith("/")) { return name; }

  const cleaned = name
    .replace(/^\.?\/?img\/profiles\//i, "")
    .replace(/\.(avif|webp|png|jpg|jpeg)$/i, "");

  return `/img/profiles/${encodeURIComponent(cleaned)}.avif`;
}
/* ---------------------------------------------------------------------------------------- */