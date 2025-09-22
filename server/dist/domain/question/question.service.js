"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toImgUrl = toImgUrl;
/* ---------------------------------------------------------------------------------------- */
function toImgUrl(name) {
    if (!name)
        return null;
    if (/^https?:\/\//i.test(name) || name.startsWith("/")) {
        return name;
    }
    const cleaned = name
        .replace(/^\.?\/?img\//i, "")
        .replace(/\.(avif|webp|png|jpg|jpeg)$/i, "");
    return `/img/${encodeURIComponent(cleaned)}.avif`;
}
/* ---------------------------------------------------------------------------------------- */ 
