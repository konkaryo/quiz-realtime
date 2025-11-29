"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toImgUrl = toImgUrl;
exports.toProfileUrl = toProfileUrl;
// /server/src/domain/media/media.service.ts
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
    return `/img/questions/${encodeURIComponent(cleaned)}.avif`;
}
/* ---------------------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------------------- */
function toProfileUrl(name) {
    if (!name || name === "0") {
        return `/img/profiles/0.avif`;
    }
    else {
        return `/img/profiles/${encodeURIComponent(name)}.avif`;
    }
}
/* ---------------------------------------------------------------------------------------- */ 
