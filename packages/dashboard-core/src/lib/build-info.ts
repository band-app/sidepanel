declare const __BAND_VERSION__: string | undefined;
declare const __BAND_BUILD_SHA__: string | undefined;
declare const __BAND_BUILD_DATE__: string | undefined;
declare const __BAND_BUILD_CHANNEL__: string | undefined;

export interface BuildInfo {
  version: string;
  sha: string;
  date: string;
  channel: string;
}

export function getBuildInfo(): BuildInfo {
  return {
    version: typeof __BAND_VERSION__ === "string" ? __BAND_VERSION__ : "0.0.0",
    sha: typeof __BAND_BUILD_SHA__ === "string" ? __BAND_BUILD_SHA__ : "dev",
    date: typeof __BAND_BUILD_DATE__ === "string" ? __BAND_BUILD_DATE__ : "",
    channel: typeof __BAND_BUILD_CHANNEL__ === "string" ? __BAND_BUILD_CHANNEL__ : "dev",
  };
}
