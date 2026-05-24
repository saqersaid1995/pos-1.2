import { useEffect } from "react";

interface StandaloneAppMetaOptions {
  title: string;
  description: string;
  applicationName: string;
  appleMobileWebAppTitle: string;
  themeColor: string;
  manifestHref: string;
  faviconHref: string;
  appleTouchIconHref: string;
}

type ManagedHeadEntry = {
  selector: string;
  tagName: "meta" | "link";
  attributes: Record<string, string>;
  valueAttribute: "content" | "href";
  value: string;
};

function upsertHeadEntry(entry: ManagedHeadEntry) {
  const existing = document.head.querySelector(entry.selector) as HTMLMetaElement | HTMLLinkElement | null;
  const element = existing ?? document.createElement(entry.tagName);
  const previousValue = element.getAttribute(entry.valueAttribute);

  Object.entries(entry.attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  element.setAttribute(entry.valueAttribute, entry.value);

  if (!existing) {
    document.head.appendChild(element);
  }

  return () => {
    if (!existing) {
      element.remove();
      return;
    }

    if (previousValue === null) {
      element.removeAttribute(entry.valueAttribute);
      return;
    }

    element.setAttribute(entry.valueAttribute, previousValue);
  };
}

export function useStandaloneAppMeta(options: StandaloneAppMetaOptions | null) {
  useEffect(() => {
    if (!options) return;

    const previousTitle = document.title;
    document.title = options.title;

    const cleanups = [
      upsertHeadEntry({
        selector: "meta[name='description']",
        tagName: "meta",
        attributes: { name: "description" },
        valueAttribute: "content",
        value: options.description,
      }),
      upsertHeadEntry({
        selector: "meta[name='application-name']",
        tagName: "meta",
        attributes: { name: "application-name" },
        valueAttribute: "content",
        value: options.applicationName,
      }),
      upsertHeadEntry({
        selector: "meta[name='apple-mobile-web-app-title']",
        tagName: "meta",
        attributes: { name: "apple-mobile-web-app-title" },
        valueAttribute: "content",
        value: options.appleMobileWebAppTitle,
      }),
      upsertHeadEntry({
        selector: "meta[name='theme-color']",
        tagName: "meta",
        attributes: { name: "theme-color" },
        valueAttribute: "content",
        value: options.themeColor,
      }),
      upsertHeadEntry({
        selector: "link[rel='manifest']",
        tagName: "link",
        attributes: { rel: "manifest" },
        valueAttribute: "href",
        value: options.manifestHref,
      }),
      upsertHeadEntry({
        selector: "link[rel='icon']",
        tagName: "link",
        attributes: { rel: "icon", type: "image/png" },
        valueAttribute: "href",
        value: options.faviconHref,
      }),
      upsertHeadEntry({
        selector: "link[rel='apple-touch-icon']",
        tagName: "link",
        attributes: { rel: "apple-touch-icon" },
        valueAttribute: "href",
        value: options.appleTouchIconHref,
      }),
    ];

    return () => {
      document.title = previousTitle;
      cleanups.reverse().forEach((cleanup) => cleanup());
    };
  }, [
    options?.title,
    options?.description,
    options?.applicationName,
    options?.appleMobileWebAppTitle,
    options?.themeColor,
    options?.manifestHref,
    options?.faviconHref,
    options?.appleTouchIconHref,
  ]);
}