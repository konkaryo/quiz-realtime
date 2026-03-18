"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCookie = getCookie;
/* ---------------------------------------------------------------------------------------- */
function getCookie(name, cookieHeader) {
    if (!cookieHeader)
        return undefined;
    const v = cookieHeader
        .split(";")
        .map((s) => s.trim())
        .find((x) => x.startsWith(name + "="));
    return v ? decodeURIComponent(v.split("=").slice(1).join("=")) : undefined;
}
/* ---------------------------------------------------------------------------------------- */ 
