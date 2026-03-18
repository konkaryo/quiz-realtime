    /* ---------------------------------------------------------------------------------------- */
    export function getCookie(name: string, cookieHeader: string | undefined): string | undefined {
        if (!cookieHeader) return undefined;
        const v = cookieHeader
            .split(";")
            .map((s) => s.trim())
            .find((x) => x.startsWith(name + "="));
    return v ? decodeURIComponent(v.split("=").slice(1).join("=")) : undefined;
    }
    /* ---------------------------------------------------------------------------------------- */