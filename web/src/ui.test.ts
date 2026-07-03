import { I18nProvider } from "@embra/i18n/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { createAppI18n } from "./i18n";
import { App } from "./ui";

describe("App", () => {
  it("does not render the console shell before the initial auth check finishes", () => {
    const markup = renderToStaticMarkup(
      createElement(
        I18nProvider,
        { i18n: createAppI18n("en") },
        createElement(MemoryRouter, { initialEntries: ["/"] }, createElement(App)),
      ),
    );

    expect(markup).not.toContain("app-shell");
    expect(markup).toContain("Loading runtime data");
  });
});
