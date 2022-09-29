import { XmlElement } from "./node";

export type XmlElementPojo = {
  name: string;
  attrs: { [qName: string]: string };
  children: (XmlElementPojo | string)[];
};

export const toPojo = (elem: XmlElement): XmlElementPojo => ({
  name: elem.name.toString(),
  attrs: Object.fromEntries(elem.attrs.map(([n, v]) => [n.toString(), v])),
  children: elem.children.map((c) => (typeof c == "string" ? c : toPojo(c))),
});

export const encodeXmlEntities = (raw: string) =>
  raw
    // Replace ampersands first.
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
    .replaceAll(">", "&gt;");
