import { parseXml } from "./parser";
import { toPojo } from "./util";

test("XML parser parses correctly", () => {
  const root = parseXml(`
    <root  a   = 
      '&amp;' xs:b="&#x10FFFF;"
                                  >&lt;<xs:abc   />
    </root   >
  `);
  expect(toPojo(root)).toEqual({
    name: "root",
    attrs: {
      a: "&",
      "xs:b": "\u{10FFFF}",
    },
    children: ["<", { name: "xs:abc", attrs: {}, children: [] }, "\n    "],
  });
});
