import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    // Cross-fade between pages via the View Transitions API. Same-document
    // transitions are Baseline; engines without them just navigate as before.
    // Reduced motion is handled in globals.css — the `*` kill switch there
    // cannot reach the view-transition pseudo-elements.
    defaultViewTransition: true,
  });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
