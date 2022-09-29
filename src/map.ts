import { Validator, ValuePath } from "@wzlin/valid";
import assertState from "@xtjs/lib/js/assertState";
import Counter from "@xtjs/lib/js/Counter";
import Dict from "@xtjs/lib/js/Dict";
import mapDefined from "@xtjs/lib/js/mapDefined";
import { XmlElement } from "./node";

type AttrMapping<P> = {
  name: string;
  ignore?: boolean;
  optional?: boolean;
  validator: Validator<P>;
};

type ElemMappingMode = "repeated" | "required" | "optional";

type ElemMapFn<R> = (elem: XmlElement, path?: ValuePath) => R;

type ElemMapping<R> = {
  name: string;
  mode: ElemMappingMode;
  ignore?: boolean;
  // `min` is only valid when `mode` is "repeated".
  min?: number;
  mapper: ElemMapFn<R>;
};

// TODO WARNING: This is not namespace aware.
export class XmlElementMapperBuilder<M extends {}> {
  private expectedName: string | undefined;
  private readonly attrMappings: AttrMapping<any>[] = [];
  private readonly elemMappings: ElemMapping<any>[] = [];
  private textMapping:
    | {
        name: string;
        ignore?: boolean;
        validator?: Validator<any>;
      }
    | undefined;

  expectName(name: string) {
    assertState(this.expectedName === undefined);
    this.expectedName = name;
    return this;
  }

  ignoreAttr<N extends string>(name: N, validator: Validator<any>) {
    this.attrMappings.push({
      name,
      ignore: true,
      validator,
    });
    return this;
  }

  maybeAttr<N extends string, P>(
    name: N,
    validator: Validator<P>
  ): XmlElementMapperBuilder<
    M & {
      [name in N]?: P | undefined;
    }
  > {
    this.attrMappings.push({
      name,
      optional: true,
      validator,
    });
    return this as any;
  }

  attr<N extends string, P>(
    name: N,
    validator: Validator<P>
  ): XmlElementMapperBuilder<
    M & {
      [name in N]: P;
    }
  > {
    this.attrMappings.push({
      name,
      validator,
    });
    return this as any;
  }

  ignore(name: string) {
    this.elemMappings.push({
      mode: "optional",
      ignore: true,
      name,
      mapper: () => void 0,
    });
    return this;
  }

  one<N extends string, R>(
    name: N,
    mapper: ElemMapFn<R>
  ): XmlElementMapperBuilder<
    M & {
      [name in N]: R;
    }
  > {
    this.elemMappings.push({
      name,
      mapper,
      mode: "required",
    });
    return this as any;
  }

  maybeOne<N extends string, R>(
    name: N,
    mapper: ElemMapFn<R>
  ): XmlElementMapperBuilder<
    M & {
      [name in N]?: R | undefined;
    }
  > {
    this.elemMappings.push({
      name,
      mapper,
      mode: "optional",
    });
    return this as any;
  }

  oneOrMore<N extends string, R>(
    name: N,
    mapper: ElemMapFn<R>
  ): XmlElementMapperBuilder<
    M & {
      [name in N]: R[];
    }
  > {
    this.elemMappings.push({
      name,
      mapper,
      mode: "repeated",
      min: 1,
    });
    return this as any;
  }

  zeroOrMore<N extends string, R>(
    name: N,
    mapper: ElemMapFn<R>
  ): XmlElementMapperBuilder<
    M & {
      [name in N]: R[];
    }
  > {
    this.elemMappings.push({
      name,
      mapper,
      mode: "repeated",
      min: 0,
    });
    return this as any;
  }

  text<N extends string, P>(
    name: N,
    validator: Validator<P>
  ): XmlElementMapperBuilder<
    M & {
      [name in N]: P;
    }
  > {
    this.textMapping = {
      name,
      validator,
    };
    return this as any;
  }

  ignoreText<N extends string>(name: N, validator: Validator<any>) {
    this.textMapping = {
      name,
      ignore: true,
      validator,
    };
    return this;
  }

  build(): ElemMapFn<M> {
    const expectedName = this.expectedName;
    const requiredAttrNames = this.attrMappings
      .filter((a) => !a.optional)
      .map((a) => a.name);
    const requiredElemCounts = this.elemMappings.map(
      (e) =>
        [
          e.name,
          e.mode == "optional" ? 0 : e.mode == "required" ? 1 : e.min ?? 0,
        ] as const
    );
    const attrMappings = new Dict<string, AttrMapping<any>>(
      this.attrMappings.map((a) => [a.name, a])
    );
    const elemMappings = new Dict<string, ElemMapping<any>>(
      this.elemMappings.map((e) => [e.name, e])
    );
    const repeatedElemNames = this.elemMappings
      .filter((e) => e.mode == "repeated")
      .map((e) => e.name);
    const textMapping = mapDefined(this.textMapping, (m) => ({ ...m }));
    return (elem, path = new ValuePath([elem.name.toString()])) => {
      if (expectedName !== undefined && elem.name.name !== expectedName) {
        throw path.isBadAsIt(
          `it is not an element with the name ${expectedName}`
        );
      }

      const res = {} as any;

      // Process attributes.
      const remainingAttrs = new Set(requiredAttrNames);
      for (const [name, value] of elem.attrs) {
        if (name.prefix === "xmlns" || name.toString() === "xmlns") {
          continue;
        }

        const m = attrMappings.get(name.name);
        if (!m) {
          throw path.isBadAsIt(`has an unexpected attribute ${name}`);
        }
        remainingAttrs.delete(name.name);
        const parsed = m.validator.parse(path.andThen(`Attr ${name}`), value);
        if (!m.ignore) {
          res[name.name] = parsed;
        }
      }
      if (remainingAttrs.size) {
        throw path.isBadAsIt(
          `is missing attributes: ${[...remainingAttrs].sort().join(", ")}`
        );
      }

      // Process children.
      let seenText = false;
      const remainingElemCounts = new Counter(requiredElemCounts);
      for (const n of repeatedElemNames) {
        res[n] = [];
      }
      for (const [childNo, child] of elem.children.entries()) {
        if (typeof child == "string") {
          const childPath = path.andThen(`Child #${childNo} (text)`);
          const isWhitespace = !child.trim();
          if (textMapping) {
            if (seenText) {
              if (!isWhitespace) {
                throw childPath.isBadAsIt(`is unexpected`);
              }
            } else {
              seenText = true;
              const parsed =
                mapDefined(textMapping.validator, (v) =>
                  v.parse(childPath, child)
                ) ?? child;
              if (!textMapping.ignore) {
                res[textMapping.name] = parsed;
              }
            }
          } else {
            if (!isWhitespace) {
              throw childPath.isBadAsIt(`is unexpected`);
            }
          }
        } else {
          const childPath = path.andThen(`Child #${childNo} (${child.name})`);
          const m = elemMappings.get(child.name.name);
          if (!m) {
            throw childPath.isBadAsIt(`is unexpected`);
          }
          remainingElemCounts.decrement(child.name.name);
          const val = m.mapper(child, childPath);
          if (!m.ignore) {
            if (m.mode == "repeated") {
              res[child.name.name].push(val);
            } else {
              res[child.name.name] = val;
            }
          }
        }
      }
      for (const [name, count] of remainingElemCounts.positiveEntries()) {
        throw path.isBadAsIt(`does not have ${count} more ${name} elements`);
      }
      if (textMapping && !seenText) {
        throw path.isBadAsIt(`does not have any expected text content`);
      }

      return res;
    };
  }
}

export const xmlTextOnlyMapper =
  <M extends string>(
    validator: Validator<M>,
    path: ValuePath = new ValuePath(["Text content"])
  ) =>
  (element: XmlElement) =>
    validator.parse(path, element.combinedText());
