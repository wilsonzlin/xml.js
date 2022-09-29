import map from "@xtjs/lib/js/map";
import numberGenerator from "@xtjs/lib/js/numberGenerator";
import { XmlElement, XmlName } from "./node";

export class XmlParseError extends Error {
  constructor(
    readonly description: string,
    readonly line: number,
    readonly col: number
  ) {
    super(`${description} [${line}:${col}]`);
  }
}

class Lexer {
  private next: number = 0;
  private line: number = 1;
  private col: number = 0;

  constructor(private readonly src: string) {}

  err(msg: string): XmlParseError {
    return new XmlParseError(msg, this.line, this.col);
  }

  peek(): string | undefined {
    return this.src[this.next];
  }

  isEnd(): boolean {
    return this.peek() === undefined;
  }

  consumeOrEnd(): string | undefined {
    const char = this.src[this.next];
    if (char === undefined) {
      return char;
    }
    if (char === "\r" || (char === "\n" && this.src[this.next - 1] !== "\r")) {
      this.line++;
      this.col = 0;
    } else if (char !== "\n") {
      this.col++;
    }
    this.next++;
    return char;
  }

  consume(): string {
    const b = this.consumeOrEnd();
    if (b === undefined) {
      throw this.err("Unexpected end");
    }
    return b;
  }

  consumeWhile(charset: string): string {
    const chars = [];
    let char;
    while ((char = this.maybeExpectOneOf(charset)) !== undefined) {
      chars.push(char);
    }
    return chars.join("");
  }

  expect(c: string): void {
    const b = this.consume();
    if (b !== c) {
      throw this.err(`Expected ${c} but got ${b}`);
    }
  }

  expectOneOf(charset: string): string {
    const got = this.consume();
    if (!charset.includes(got)) {
      throw this.err(`Expected one of {${charset}} but got ${got}`);
    }
    return got;
  }

  maybeExpect(c: string): boolean {
    const b = this.peek();
    if (c === b) {
      this.consume();
      return true;
    }
    return false;
  }

  maybeExpectOneOf(c: string): string | undefined {
    const b = this.peek();
    if (b !== undefined && c.includes(b)) {
      return this.consume();
    }
    return undefined;
  }

  maybeExpectNotOneOf(c: string): string | undefined {
    const b = this.peek();
    if (b === undefined || !c.includes(b)) {
      return this.consume();
    }
    return undefined;
  }

  expectOneOrMoreOf(charset: string, expectName: string): string {
    const matches = [];
    let char;
    while ((char = this.maybeExpectOneOf(charset)) !== undefined) {
      matches.push(char);
    }
    if (!matches.length) {
      throw this.err(`Expected ${expectName}`);
    }
    return matches.join("");
  }

  skipIf(c: string): boolean {
    if (this.peek() === c) {
      this.consume();
      return true;
    }
    return false;
  }

  skipWhile(charset: string): number {
    let count = 0;
    while (this.maybeExpectOneOf(charset) !== undefined) {
      count++;
    }
    return count;
  }

  skipUntil(charset: string): number {
    let count = 0;
    while (this.maybeExpectNotOneOf(charset) !== undefined) {
      count++;
    }
    return count;
  }
}

const r = (from: string, to: string) =>
  [
    ...map(numberGenerator(from.charCodeAt(0), to.charCodeAt(0) + 1, 1), (c) =>
      String.fromCharCode(c)
    ),
  ].join("");

const LOWERCASE = r("a", "z");
const UPPERCASE = r("A", "Z");
const DIGIT = r("0", "9");
const HEX = r("a", "f") + r("A", "F") + DIGIT;
const ALPHANUMERIC = LOWERCASE + UPPERCASE + DIGIT;
const WHITESPACE = " \r\n\t";
const QUOTE = "'\"";

const ENTITY_REFS: {
  [name: string]: string;
} = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
};

const parseName = (l: Lexer): XmlName => {
  const name = l.expectOneOrMoreOf(ALPHANUMERIC, "element/attribute name");
  if (!l.maybeExpect(":")) {
    return new XmlName("", name);
  }
  return new XmlName(
    name,
    l.expectOneOrMoreOf(ALPHANUMERIC, "prefixed element/attribute name")
  );
};

const parseEntity = (l: Lexer): string => {
  l.expect("&");
  let cp;
  if (l.skipIf("#")) {
    if (l.skipIf("x") || l.skipIf("X")) {
      const num = l.consumeWhile(HEX);
      if (num.length < 1 || num.length > 6) {
        throw l.err("Hexadecimal entity is invalid");
      }
      cp = Number.parseInt(num, 16);
    } else {
      const num = l.consumeWhile(DIGIT);
      if (num.length < 1 || num.length > 7) {
        throw l.err("Decimal entity is invalid");
      }
      cp = Number.parseInt(num, 10);
    }
  } else {
    const name = l.consumeWhile(LOWERCASE);
    cp = ENTITY_REFS[name].charCodeAt(0);
    if (!cp) {
      throw l.err(`Invalid entity reference: ${name}`);
    }
  }
  l.expect(";");
  try {
    return String.fromCodePoint(cp);
  } catch (err) {
    throw l.err(`Entity refers to invalid Unicode code point ${cp}`);
  }
};

const parseTextOrValue = (l: Lexer, delimiter: string): string => {
  const parts = [];
  outer: while (true) {
    switch (l.peek()) {
      case undefined:
      case delimiter:
        break outer;
      case "&":
        parts.push(parseEntity(l));
        break;
      default:
        parts.push(l.consume());
    }
  }
  return parts.join("");
};

const parseContent = (l: Lexer, parentElem: XmlElement): void => {
  while (true) {
    const text = parseTextOrValue(l, "<");
    if (text.length) {
      parentElem.addChild(text);
    } else {
      if (l.isEnd()) {
        break;
      }
      l.expect("<");
      if (l.skipIf("!")) {
        // TODO Comments.
        l.skipUntil(">");
        l.expect(">");
        continue;
      }
      if (l.skipIf("?")) {
        while (true) {
          l.skipUntil('"?');
          if (l.skipIf('"')) {
            l.skipUntil('"');
            l.expect('"');
          } else {
            l.expect("?");
            l.expect(">");
            break;
          }
        }
        continue;
      }
      const isClosing = l.skipIf("/");
      const name = parseName(l);
      if (isClosing) {
        // Closing tag.
        if (parentElem.name.name === "") {
          throw l.err("Unexpected closing tag");
        }
        if (!name.equals(parentElem.name)) {
          throw l.err(
            `Mismatched closing tag; expected ${parentElem} but got ${name}`
          );
        }
        l.skipWhile(WHITESPACE);
        l.expect(">");
        break;
      }

      const attrs: [XmlName, string][] = [];

      // Opening tag.
      let selfClosing = false;
      while (true) {
        l.skipWhile(WHITESPACE);
        if (l.skipIf("/")) {
          l.expect(">");
          selfClosing = true;
          break;
        }
        if (l.skipIf(">")) {
          break;
        }
        const attrName = parseName(l);
        l.skipWhile(WHITESPACE);
        l.expect("=");
        l.skipWhile(WHITESPACE);
        const attrQuote = l.expectOneOf(QUOTE);
        const attrValue = parseTextOrValue(l, attrQuote);
        l.expect(attrQuote);
        attrs.push([attrName, attrValue]);
      }
      const elem = new XmlElement(undefined, name, attrs);
      if (!selfClosing) {
        parseContent(l, elem);
      }
      parentElem.addChild(elem);
    }
  }
};

export const parseXml = (xml: string): XmlElement => {
  const dummyRoot = new XmlElement(undefined, new XmlName("", ""), []);
  parseContent(new Lexer(xml), dummyRoot);
  let root: XmlElement | undefined;
  for (const c of dummyRoot.children) {
    if (typeof c == "string") {
      if (c.trim()) {
        throw new XmlParseError(
          "XML document has top-level non-whitespace text",
          1,
          0
        );
      }
    } else {
      if (root) {
        throw new XmlParseError(
          "XML document has multiple top level elements",
          1,
          0
        );
      }
      root = c;
    }
  }
  if (!root) {
    throw new XmlParseError("XML document does not have root element", 1, 0);
  }
  root.detach();
  return root;
};
