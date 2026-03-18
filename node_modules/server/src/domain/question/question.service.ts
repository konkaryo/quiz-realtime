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