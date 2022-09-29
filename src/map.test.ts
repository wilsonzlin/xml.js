import { VDate, VInteger } from "@wzlin/valid";
import { XmlElementMapperBuilder } from "./map";
import { parseXml } from "./parser";

test("XML mapper validates and maps properly", () => {
  const root = parseXml(
    `
    <root created="2021-02-05T05:00:00.000Z">
      <User id="1"/>
      <User id="2"/>
    </root>
  `.trim()
  );
  const mapper = new XmlElementMapperBuilder()
    .attr("created", new VDate())
    .oneOrMore(
      "User",
      new XmlElementMapperBuilder().attr("id", new VInteger()).build()
    )
    .zeroOrMore("Group", new XmlElementMapperBuilder().build())
    .build();
  const mapped = mapper(root);
  expect(mapped).toStrictEqual({
    created: new Date(Date.UTC(2021, 1, 5, 5)),
    User: [{ id: 1 }, { id: 2 }],
    Group: [],
  });
});
