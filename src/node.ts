import findAndRemove from "@xtjs/lib/js/findAndRemove";
import { encodeXmlEntities } from "./util";

export class XmlName {
  constructor(readonly prefix: string, readonly name: string) {}

  static fromQName(n: string) {
    const parts = n.split(":", 2);
    if (parts.length == 1) {
      parts.unshift("");
    }
    return new XmlName(parts[0], parts[1]);
  }

  toString() {
    return this.prefix.length ? `${this.prefix}:${this.name}` : this.name;
  }

  equals(other: XmlName) {
    return this.prefix === other.prefix && this.name === other.name;
  }

  hashCode() {
    return this.toString();
  }
}

export type XmlQuery = {
  id?: string;
  name?: string;
};

const assertMatched = (
  query: XmlQuery,
  result: XmlElement | undefined
): XmlElement => {
  if (!result) {
    throw new ReferenceError(
      `No XML elements could be found matching the query ${JSON.stringify(
        query
      )}`
    );
  }
  return result;
};

const atMostOne = <V>(iterator: Iterator<V>): V | undefined => {
  const one = iterator.next().value;
  if (!iterator.next().done) {
    throw new ReferenceError(
      "More than one element found; for safety reasons, at most one element can match"
    );
  }
  return one;
};

export class XmlElement {
  readonly children: XmlNode[] = [];

  constructor(
    private parent: XmlElement | undefined,
    readonly name: XmlName,
    readonly attrs: [XmlName, string][]
  ) {}

  static of(
    qName: string,
    attrs: { [qName: string]: string | undefined },
    children: XmlNode[]
  ) {
    const elem = new XmlElement(
      undefined,
      XmlName.fromQName(qName),
      Object.entries(attrs)
        .map(([qName, value]) => [XmlName.fromQName(qName), value])
        .filter((p): p is [XmlName, string] => p[1] !== undefined)
    );
    for (const c of children) {
      elem.addChild(c);
    }
    return elem;
  }

  addChild(child: XmlNode, pos: number = this.children.length): void {
    if (!Number.isSafeInteger(pos) || pos < 0 || pos > this.children.length) {
      throw new RangeError(`Cannot add child at out-of-bounds position ${pos}`);
    }
    if (typeof child != "string") {
      if (child.parent) {
        throw new ReferenceError("Cannot add child that already has parent");
      }
      child.parent = this;
    }
    this.children.splice(pos, 0, child);
  }

  detach(): [XmlElement, number] {
    const p = this.parent;
    if (!p) {
      throw new Error(
        "XML element does not have a parent and cannot be detached"
      );
    }
    // `deleteChild` will set `this.parent` to undefined.
    return [p, p.deleteChild(this)];
  }

  deleteChild(child: XmlElement): number {
    const pos = this.children.findIndex((c) => c === child);
    if (pos > -1) {
      this.children.splice(pos, 1);
      child.parent = undefined;
    }
    return pos;
  }

  filterOut(unselector: XmlQuery | XmlElement): XmlElement {
    const filtered = new XmlElement(undefined, this.name, this.attrs.slice());
    for (const child of this.children) {
      if (typeof child == "string") {
        filtered.addChild(child);
      } else if (!child.matches(unselector)) {
        filtered.addChild(child.filterOut(unselector));
      }
    }
    return filtered;
  }

  getAttributeValueOrThrow(name: string): string {
    const attr = this.attrs.find(([n]) => n.name === name);
    if (!attr) {
      throw new ReferenceError(`No attribute found with name ${name}`);
    }
    return attr[1];
  }

  deleteAttribute(name: string) {
    return findAndRemove(this.attrs, ([n]) => n.name === name);
  }

  matches(q: XmlQuery | XmlElement): boolean {
    if (q instanceof XmlElement) {
      return q === this;
    }

    const { id, name } = q;
    if (
      id !== undefined &&
      this.attrs.find(([name]) => name.name === "ID")?.[1] === id
    ) {
      return true;
    }
    if (name !== undefined && this.name.name === name) {
      return true;
    }
    return false;
  }

  *findChildren(q: XmlQuery): Generator<XmlElement> {
    for (const c of this.children) {
      if (!(c instanceof XmlElement)) {
        continue;
      }
      if (c.matches(q)) {
        yield c;
      }
    }
  }

  findAtMostOneChild(q: XmlQuery): XmlElement | undefined {
    return atMostOne(this.findChildren(q));
  }

  findAtMostOneChildOrThrow(q: XmlQuery): XmlElement {
    return assertMatched(q, this.findAtMostOneChild(q));
  }

  *findDescendants(q: XmlQuery): Generator<XmlElement> {
    for (const c of this.children) {
      if (!(c instanceof XmlElement)) {
        continue;
      }
      if (c.matches(q)) {
        yield c;
      }
      yield* c.findDescendants(q);
    }
  }

  findAtMostOneDescendant(q: XmlQuery): XmlElement | undefined {
    return atMostOne(this.findDescendants(q));
  }

  findAtMostOneDescendantOrThrow(q: XmlQuery): XmlElement {
    return assertMatched(q, this.findAtMostOneDescendant(q));
  }

  combinedText(): string {
    return this.children.filter((c) => typeof c == "string").join("");
  }

  toString(): string {
    return [
      "<",
      this.name,
      ...this.attrs.map(
        ([name, value]) => ` ${name}="${encodeXmlEntities(value)}"`
      ),
      this.children.length
        ? ">" + this.children.join("") + "</" + this.name + ">"
        : "/>",
    ].join("");
  }
}

export type XmlText = string;

export type XmlNode = XmlElement | XmlText;
