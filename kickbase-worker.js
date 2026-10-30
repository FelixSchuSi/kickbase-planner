const ALLOWED_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"];
const ALLOWED_HEADERS = ["Accept", "Authorization", "Content-Type"];

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowedOrigins = (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim());
    const headers = new Headers({
      "Cache-Control": "no-store",
      Vary: "Origin",
    });

    if (origin && !allowedOrigins.includes(origin)) {
      return new Response("Origin not allowed", { status: 403, headers });
    }

    if (origin) {
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS.join(", "));
      headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS.join(", "));
      headers.set("Access-Control-Expose-Headers", "Retry-After");
      headers.set("Access-Control-Max-Age", "86400");
    }

    const url = new URL(request.url);
    if (!url.pathname.startsWith("/v4/")) {
      return new Response("Use /v4/ to access the Kickbase API", {
        status: 404,
        headers,
      });
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (!ALLOWED_METHODS.includes(request.method)) {
      headers.set("Allow", [...ALLOWED_METHODS, "OPTIONS"].join(", "));
      return new Response("Method not allowed", { status: 405, headers });
    }

    // Keep the upstream host fixed; preserve the API path and query string.
    const upstreamUrl = new URL("https://api.kickbase.com");
    upstreamUrl.pathname = url.pathname;
    upstreamUrl.search = url.search;
    const upstreamHeaders = new Headers();
    for (const name of ALLOWED_HEADERS) {
      const value = request.headers.get(name);
      if (value !== null) upstreamHeaders.set(name, value);
    }

    try {
      const upstream = await fetch(upstreamUrl, {
        method: request.method,
        headers: upstreamHeaders,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        redirect: "manual",
        cache: "no-store",
      });

      // Workers only supports "manual" and "follow" redirect modes.
      if ([301, 302, 303, 307, 308].includes(upstream.status)) {
        throw new Error(`Kickbase API returned an unexpected redirect (HTTP ${upstream.status})`);
      }

      for (const name of ["Content-Type", "Retry-After", "WWW-Authenticate"]) {
        const value = upstream.headers.get(name);
        if (value !== null) headers.set(name, value);
      }

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      });
    } catch (error) {
      const details = {
        name: error?.name || "Error",
        message: error?.message || String(error),
        ...(error?.cause != null && {
          cause: error.cause.message || String(error.cause),
        }),
      };
      console.error("Kickbase proxy request failed", {
        method: request.method,
        path: upstreamUrl.pathname,
        ...details,
        stack: error?.stack,
      });
      headers.set("Content-Type", "application/json");
      return new Response(JSON.stringify({ error: "Unable to reach Kickbase API", details }), {
        status: 502,
        headers,
      });
    }
  },
};
