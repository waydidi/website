// Pure, with no runtime imports, so it is unit tested directly. The Tailwind styles need CSS cascade layers;
// a browser without them shows the site unstyled and the booking form can be unusable.
export const UNSUPPORTED_BROWSER_PATH = "/unsupported.html";
export const OLD_BROWSER_OK_KEY = "waydidi-old-browser-ok";

// On unless the owner sets UNSUPPORTED_BROWSER_PAGE=0 in Cloudflare (a kill switch if the check ever misfires).
export function unsupportedBrowserCheckEnabled(bindings: Record<string, unknown>) {
  return bindings.UNSUPPORTED_BROWSER_PAGE !== "0";
}

// Inline <head> script. Plain old JavaScript on purpose: it must run in the browsers it is meant to catch.
// A visitor who chose "try this page anyway" is remembered for the tab, so there is no redirect loop.
export const UNSUPPORTED_BROWSER_SCRIPT =
  `try{if(typeof window.CSSLayerBlockRule!=="function"&&location.pathname!=="${UNSUPPORTED_BROWSER_PATH}"){` +
  `var ok=false;try{ok=sessionStorage.getItem("${OLD_BROWSER_OK_KEY}")==="1"}catch(e){}` +
  `if(!ok)location.replace("${UNSUPPORTED_BROWSER_PATH}?redirect="+encodeURIComponent(location.pathname+location.search))}}catch(e){}`;
