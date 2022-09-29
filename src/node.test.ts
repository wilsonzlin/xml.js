import mapDefined from "@xtjs/lib/js/mapDefined";
import { parseXml } from "./parser";
import { toPojo } from "./util";

test("XML queries find correct nodes", () => {
  const root = parseXml(
    `
    <root ID="1">
      <child>
        <grandchild ID="1"></grandchild>
        <grandchild></grandchild>
      </child>
      <child>
        <grandchild xml:ID="2"></grandchild>
        <a:grandchild ID="1"/>
      </child>
    </root>
  `.trim()
  );
  expect(root.matches({ id: "1" })).toBe(true);
  expect(root.matches({ id: "2" })).toBe(false);
  expect([...root.findChildren({ id: "1" })].map(toPojo)).toStrictEqual([]);
  expect([...root.findDescendants({ id: "1" })].map(toPojo)).toStrictEqual([
    { name: "grandchild", attrs: { ID: "1" }, children: [] },
    { name: "a:grandchild", attrs: { ID: "1" }, children: [] },
  ]);
  expect(root.findAtMostOneChild({ id: "1" })).toStrictEqual(undefined);
  expect(() => root.findAtMostOneDescendant({ id: "1" })).toThrow(
    "More than one element found; for safety reasons, at most one element can match"
  );
  expect(
    mapDefined(root.findAtMostOneDescendant({ id: "2" }), toPojo)
  ).toStrictEqual({
    name: "grandchild",
    attrs: { "xml:ID": "2" },
    children: [],
  });
  expect(
    [...root.findDescendants({ name: "grandchild" })].map(toPojo)
  ).toStrictEqual([
    { name: "grandchild", attrs: { ID: "1" }, children: [] },
    { name: "grandchild", attrs: {}, children: [] },
    { name: "grandchild", attrs: { "xml:ID": "2" }, children: [] },
    { name: "a:grandchild", attrs: { ID: "1" }, children: [] },
  ]);
  expect(root.toString()).toStrictEqual(
    `
    <root ID="1">
      <child>
        <grandchild ID="1"/>
        <grandchild/>
      </child>
      <child>
        <grandchild xml:ID="2"/>
        <a:grandchild ID="1"/>
      </child>
    </root>
  `.trim()
  );
});
