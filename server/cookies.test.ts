import type { Request } from "express";
import { afterEach, describe, expect, it } from "vitest";
import { getSessionCookieOptions } from "./_core/cookies";

const originalNodeEnv = process.env.NODE_ENV;
const originalOAuthServerUrl = process.env.OAUTH_SERVER_URL;
const originalAppId = process.env.VITE_APP_ID;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  if (originalOAuthServerUrl === undefined) delete process.env.OAUTH_SERVER_URL;
  else process.env.OAUTH_SERVER_URL = originalOAuthServerUrl;

  if (originalAppId === undefined) delete process.env.VITE_APP_ID;
  else process.env.VITE_APP_ID = originalAppId;
});

describe("getSessionCookieOptions", () => {
  it("uses the Host header when a lightweight request context has no Express get method", () => {
    const options = getSessionCookieOptions({
      headers: { host: "poultrybm-swqcxo7p.manus.space" },
    } as Request);

    expect(options).toMatchObject({
      httpOnly: true,
      path: "/",
    });
  });

  it("uses the reverse proxy’s public host for production cookie scope", () => {
    process.env.NODE_ENV = "production";
    process.env.OAUTH_SERVER_URL = "https://api.manus.im";
    process.env.VITE_APP_ID = "test-app";
    const options = getSessionCookieOptions({
      get: (header: string) => {
        if (header === "host") return "cb66vicb4j-omec7dumka-uk.a.run.app";
        if (header === "x-forwarded-host") return "poultrybm-swqcxo7p.manus.space";
        return undefined;
      },
      headers: {},
    } as unknown as Request);

    expect(options).toMatchObject({
      domain: "poultrybm-swqcxo7p.manus.space",
      secure: true,
      sameSite: "none",
    });
  });

  it("uses a secure host-only cookie for Railway local email/password sessions", () => {
    process.env.NODE_ENV = "production";
    delete process.env.OAUTH_SERVER_URL;
    delete process.env.VITE_APP_ID;

    const options = getSessionCookieOptions({
      get: (header: string) => (header === "host" ? "poultry-manager-production.up.railway.app" : undefined),
      headers: {},
    } as unknown as Request);

    expect(options).toMatchObject({
      secure: true,
      sameSite: "lax",
      path: "/",
      httpOnly: true,
    });
    expect(options.domain).toBeUndefined();
  });
});
