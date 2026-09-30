/**
 * The EDUK8U org chart, checked without a database.
 *
 * This dataset is a transcription of somebody's real organisation, which is
 * going back to them for review. The risk it carries is not that it crashes:
 * it is that it quietly says something about EDUK8U that EDUK8U's own chart
 * does not. So what is checked here is mostly truthfulness - that no row claims
 * to be a person, that no personal detail was invented to fill a column, that
 * every line that was inferred is marked as inferred - and only then the
 * structural properties that keep the chart drawable.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  EDUK8U_ID_MAX,
  EDUK8U_ID_MIN,
  eduk8uAll,
  eduk8uAnnotations,
  eduk8uCompany,
  eduk8uDepartments,
  eduk8uExternal,
  eduk8uPositions,
  eduk8uSourceLayout,
  eduk8uSourceLinks,
  eduk8uSourceNotes,
  reportingLineConfidence,
  type Eduk8uPosition,
} from "../src/database/eduk8uData.js";

const all = eduk8uAll();
const byId = new Map<number, Eduk8uPosition>(all.map((position) => [position.id, position]));

test("the company is EDUK8U, on Malaysian time", () => {
  assert.equal(eduk8uCompany.name, "EDUK8U Group");
  assert.equal(eduk8uCompany.timezone, "Asia/Kuala_Lumpur");
  // Meridian is a different company in a different environment. Nothing of it
  // may travel here, in any casing.
  const text = JSON.stringify([all, eduk8uDepartments, eduk8uCompany]).toLowerCase();
  for (const word of ["meridian", "demo.invalid", "sdn. bhd"]) {
    assert.ok(!text.includes(word), `"${word}" appears in the EDUK8U dataset`);
  }
});

test("every entry stays inside the reserved identifier range, and is unique", () => {
  const seen = new Set<number>();
  const numbers = new Set<string>();
  for (const position of all) {
    assert.ok(
      position.id >= EDUK8U_ID_MIN && position.id <= EDUK8U_ID_MAX,
      `${position.id} (${position.name}) is outside ${EDUK8U_ID_MIN}-${EDUK8U_ID_MAX}`,
    );
    assert.ok(!seen.has(position.id), `duplicate id ${position.id}`);
    seen.add(position.id);
    assert.ok(!numbers.has(position.employeeNumber), `duplicate employee number ${position.employeeNumber}`);
    numbers.add(position.employeeNumber);
  }
  // The Meridian presentation company owns 9200-9299 and must not be touched.
  assert.ok(EDUK8U_ID_MIN > 9299, "the EDUK8U range overlaps the presentation range");
});

test("nothing in the dataset claims to be a person", () => {
  // The source names nobody, so every entry is a position or an external party.
  for (const position of all) {
    assert.ok(
      position.kind === "vacant" || position.kind === "external",
      `${position.name} is loaded as "${position.kind}", which asserts an employed person`,
    );
  }
  assert.equal(all.filter((p) => p.kind === "vacant").length, 21);
  assert.equal(all.filter((p) => p.kind === "external").length, 8);
});

test("no personal detail was invented to fill a column", () => {
  // The whole dataset is serialised and searched, so a field added later cannot
  // smuggle personal data in without failing here.
  const forbidden: Array<[RegExp, string]> = [
    [/\b[\w.+-]+@[\w-]+\.[\w.]+\b/, "an email address"],
    [/\+?\d[\d\s()-]{7,}\d/, "a phone number"],
    [/\b(19|20)\d{2}-\d{2}-\d{2}\b/, "a date"],
  ];
  for (const position of all) {
    // `note` is prose written for Dr. Roy and may legitimately mention the
    // chart's approval date; the data fields may not contain any of this.
    const data = JSON.stringify({ ...position, note: undefined });
    for (const [pattern, what] of forbidden) {
      assert.ok(!pattern.test(data), `${position.name} carries ${what}: ${data}`);
    }
  }
  // Nothing in the type even offers a place for pay, and nothing added one.
  for (const position of all) {
    for (const key of ["salary", "basicSalarySen", "dateOfBirth", "address", "phone", "email"]) {
      assert.ok(!(key in position), `${position.name} has a "${key}" field`);
    }
  }
});

test("every reporting line points at an entry that exists, and no line loops", () => {
  for (const position of all) {
    if (position.managerId === null) continue;
    assert.ok(byId.has(position.managerId), `${position.name} reports to unknown id ${position.managerId}`);
    assert.notEqual(position.managerId, position.id, `${position.name} reports to itself`);
  }
  for (const position of all) {
    const seen = new Set<number>([position.id]);
    let cursor = position.managerId;
    while (cursor !== null) {
      assert.ok(!seen.has(cursor), `reporting lines loop at ${position.name}`);
      seen.add(cursor);
      cursor = byId.get(cursor)!.managerId;
    }
  }
});

test("every internal position reaches a root, so the whole chart can be drawn", () => {
  const roots = eduk8uPositions.filter((position) => position.managerId === null);
  // Two: the Group CEO & CHRO and the Group Chief Marketing Officer &
  // Co-Founder, which the source draws with no line between them.
  assert.equal(roots.length, 2, `expected 2 roots, found ${roots.map((r) => r.name).join(", ")}`);

  const reachable = new Set(roots.map((root) => root.id));
  for (let added = true; added; ) {
    added = false;
    for (const position of eduk8uPositions) {
      if (!reachable.has(position.id) && position.managerId !== null && reachable.has(position.managerId)) {
        reachable.add(position.id);
        added = true;
      }
    }
  }
  const stranded = eduk8uPositions.filter((position) => !reachable.has(position.id));
  assert.deepEqual(stranded.map((p) => p.name), [], "these positions hang off nothing");
});

test("external parties are never given a place in the reporting hierarchy", () => {
  for (const position of eduk8uExternal) {
    assert.equal(position.kind, "external");
    // The source draws no line to any of them. Giving one a manager would say
    // EDUK8U employs their auditor.
    assert.equal(position.managerId, null, `${position.name} was given a manager`);
    assert.equal(position.department, "External / Advisory");
  }
  // And nobody reports to an external party either.
  for (const position of all) {
    if (position.managerId === null) continue;
    assert.notEqual(byId.get(position.managerId)!.kind, "external",
      `${position.name} reports to an external party`);
  }
});

test("every inferred reporting line is marked, and says why", () => {
  for (const position of all) {
    assert.ok(["confirmed", "grouping", "ambiguous"].includes(position.confidence),
      `${position.name} has confidence "${position.confidence}"`);
    if (position.confidence !== "confirmed") {
      assert.ok(position.note && position.note.length > 40,
        `${position.name} is "${position.confidence}" but does not explain why`);
    }
  }
  // What the source does not settle and Dr. Roy has not since answered. He has
  // confirmed the interns' lines and the CEO Special Officer, which leaves the
  // two below. If this number moves, the questions in
  // docs/EDUK8U_ORG_MAPPING.md have to move with it.
  const ambiguous = all.filter((position) => position.confidence === "ambiguous");
  assert.deepEqual(
    ambiguous.map((position) => position.id).sort(),
    [9302, 9320],
    `open questions: ${ambiguous.map((p) => p.name).join(", ")}`,
  );
});

test("the structure matches the source chart's connectors", () => {
  // Read from the PowerPoint's own connector elements, not from the order of
  // the text. Each pair is "this position" -> "the box its arrow points at".
  const expected: Array<[number, number | null]> = [
    [9301, null],  // Group CEO & CHRO
    [9302, null],  // Group Chief Marketing Officer & Co-Founder: no line to the CEO
    [9303, 9301],  // Company Accountant
    [9304, 9303],  // Finance Admin Intern
    [9305, 9301], [9306, 9301], [9307, 9301],  // the three Snr BD Execs
    [9308, 9305],  // Admin Intern, on the BD bracket
    [9309, 9302], [9310, 9302],  // the two Marketing Execs
    [9311, 9309],  // GD Interns, drawn to both Marketing Execs
    [9312, 9301], [9313, 9301], [9314, 9301],  // the three Tech Developers
    [9315, 9312],  // Tech Interns, on the developer spine
    [9316, 9301],  // Head of Compliance & Quality Management
    [9317, 9316],  // Internal QA / Compliance Admin / Doc Controller
    [9318, 9301],  // Welfare Liaison & Client Service AU
    [9319, 9318],  // Liaison Officer
    [9320, 9319],  // second Liaison Officer, drawn below the first
    [9321, 9301],  // CEO Special Officer
  ];
  assert.equal(expected.length, eduk8uPositions.length);
  for (const [id, managerId] of expected) {
    assert.equal(byId.get(id)?.managerId, managerId, `reporting line for ${byId.get(id)?.name ?? id}`);
  }
});

test("source terminology is preserved rather than tidied up", () => {
  const names = all.map((position) => position.name);
  // "TBH" is in the source and its meaning was never established, so it stays.
  assert.equal(names.filter((name) => name.includes("TBH")).length, 3);
  // The numbering that distinguishes otherwise identical seats stays too.
  for (const prefix of ["1. Snr BD Exec", "2. Snr BD Exec", "3. Snr BD Exec"]) {
    assert.ok(names.some((name) => name.startsWith(prefix)), `${prefix} is missing`);
  }
  // A box standing for two people says so rather than being silently split.
  assert.ok(names.includes("2 X Tech Intern"));
  assert.ok(names.includes("Marketing: GD Intern KL X 2"));
});

test("every position belongs to a declared department", () => {
  const known = new Set<string>(eduk8uDepartments.map((department) => department.name));
  for (const position of all) {
    assert.ok(known.has(position.department), `${position.name}: unknown department "${position.department}"`);
  }
  // No department is declared and then left empty, which would read on the
  // chart as a part of EDUK8U that this review forgot.
  for (const department of eduk8uDepartments) {
    assert.ok(all.some((position) => position.department === department.name),
      `no position is in "${department.name}"`);
  }
});

test("text on the chart that is not a position is recorded as such", () => {
  // Each of these would otherwise look like a missing box. They are listed so
  // the omission is a decision somebody can disagree with, not an oversight.
  const labels = eduk8uAnnotations.map((annotation) => annotation.label).join(" | ");
  for (const fragment of ["SALES / BD Function", "Individual Contributor", "Approved by MD"]) {
    assert.ok(labels.includes(fragment), `"${fragment}" is not accounted for`);
  }
  for (const annotation of eduk8uAnnotations) {
    assert.ok(annotation.reading.length > 40, `"${annotation.label}" is not explained`);
  }
  // And none of them was also loaded as a position.
  const names = new Set(all.map((position) => position.name));
  assert.ok(!names.has("Individual Contributor"));
  assert.ok(!names.has("SALES / BD Function"));
});

test("an unsettled reporting line is stored as unsettled, not as a fact", () => {
  for (const position of all) {
    const stored = reportingLineConfidence(position);
    if (position.managerId === null) {
      // No line, so nothing to grade. The database CHECK says the same.
      assert.equal(stored, null, `${position.name} is a root but carries a grade`);
      continue;
    }
    assert.notEqual(stored, null, `${position.name} has a reporting line with no grade`);
    // The six questions for Dr. Roy must reach the chart as open questions.
    if (position.confidence === "ambiguous") {
      assert.equal(stored, "unconfirmed", `${position.name} would be drawn as settled`);
    }
    if (position.confidence === "confirmed") assert.equal(stored, "confirmed");
    if (position.confidence === "grouping") assert.equal(stored, "inferred");
  }
  // Two entries are still open. One of them - the Group Chief Marketing Officer
  // & Co-Founder - is a root, and its question is whether a line to the Group
  // CEO is missing altogether, which no grade on an existing line can express;
  // the chart says it by standing as its own branch. So one line carries the
  // mark, and the other question is the shape of the chart itself.
  const unconfirmed = all.filter((p) => reportingLineConfidence(p) === "unconfirmed");
  assert.deepEqual(unconfirmed.map((p) => p.id), [9320], `marked unconfirmed: ${unconfirmed.map((p) => p.name).join(", ")}`);
  const ambiguousRoots = all.filter((p) => p.confidence === "ambiguous" && p.managerId === null);
  assert.deepEqual(ambiguousRoots.map((p) => p.id), [9302]);
});

test("the Group CEO's direct reports are each backed by the source", () => {
  // Ten boxes point at the Group CEO. The evidence is not the same for all of
  // them, so it is recorded per report rather than as one claim about ten.
  const reports = all.filter((position) => position.managerId === 9301);
  assert.equal(reports.length, 10);

  // Five are bound connectors in the PowerPoint: the file itself names both
  // shapes the line joins.
  const bound = [9303, 9305, 9314, 9316, 9318];
  for (const id of bound) {
    assert.equal(byId.get(id)?.confidence, "confirmed", `${byId.get(id)?.name} should be a bound connector`);
  }
  // Four reach the CEO along an elbow or spine they share with their peers.
  const shared = [9306, 9307, 9312, 9313];
  for (const id of shared) {
    assert.equal(byId.get(id)?.confidence, "grouping", `${byId.get(id)?.name} should be grouping`);
  }
  // One is free text beside the line into the CEO with no connector at all, so
  // the drawing alone could not settle it. Dr. Roy has since confirmed the post
  // and its line, which is a better authority than the drawing.
  assert.equal(byId.get(9321)?.confidence, "confirmed");
  assert.equal(bound.length + shared.length + 1, reports.length);
});

test("the second Liaison Officer's line is not presented as established", () => {
  // Connector 53 binds Liaison Officer -> Welfare Liaison at both ends, so that
  // one is a fact. The line below it, connector 59, is bound to nothing at
  // either end: the diagram draws it, but the file never attached it. Two posts
  // with the same title and the same (1: 36) ratio are as likely to be peers.
  assert.equal(byId.get(9319)?.managerId, 9318);
  assert.equal(byId.get(9319)?.confidence, "confirmed");

  assert.equal(byId.get(9320)?.managerId, 9319);
  assert.equal(byId.get(9320)?.confidence, "ambiguous");
  assert.equal(reportingLineConfidence(byId.get(9320)!), "unconfirmed");
});

test("every position has a place on the source drawing, and none overlaps another", () => {
  // The chart is drawn where its source drew it, so a missing coordinate is a
  // missing box and two boxes in one place is an unreadable chart.
  for (const position of all) {
    const box = eduk8uSourceLayout[position.id];
    assert.ok(box, `${position.name} has no source coordinates`);
    assert.ok(box!.width > 0 && box!.height > 0, `${position.name} has an empty source box`);
  }
  assert.equal(Object.keys(eduk8uSourceLayout).length, all.length);

  // Cards are drawn one fixed height, so two boxes clash when they share a
  // column and sit closer than that.
  const CARD = 0.6;
  const placed = all.map((position) => ({ name: position.name, ...eduk8uSourceLayout[position.id]! }));
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      const a = placed[i]!;
      const b = placed[j]!;
      const overlapX = a.x < b.x + b.width && b.x < a.x + a.width;
      const overlapY = a.y < b.y + CARD && b.y < a.y + CARD;
      assert.ok(!(overlapX && overlapY), `"${a.name}" and "${b.name}" are drawn on top of each other`);
    }
  }
});

test("the source drawing's own groups keep their places", () => {
  const at = (id: number) => eduk8uSourceLayout[id]!;
  // Read off the source: marketing far left, BD left of centre, the CEO above
  // the middle, finance under it, then technology, compliance and welfare
  // rightwards. If this ordering ever changes, the chart has stopped being a
  // reconstruction of the drawing it came from.
  const columns = [
    [9309, "1. Marketing Exec."],
    [9305, "1. Snr BD Exec"],
    [9303, "Company Accountant"],
    [9312, "1. Tech Developer"],
    [9316, "Head of Compliance"],
    [9318, "Welfare Liaison"],
  ] as const;
  for (let i = 1; i < columns.length; i += 1) {
    assert.ok(
      at(columns[i]![0]).x > at(columns[i - 1]![0]).x,
      `${columns[i]![1]} should sit right of ${columns[i - 1]![1]}`,
    );
  }
  // The two tops are above everything that hangs from them.
  for (const [top, below] of [[9301, 9303], [9302, 9309]] as const) {
    assert.ok(at(top).y < at(below).y, `${top} should sit above ${below}`);
  }
  // External parties sit below every one of the company's own positions.
  const lowestInternal = Math.max(...eduk8uPositions.map((p) => at(p.id).y));
  const highestExternal = Math.min(...eduk8uExternal.map((p) => at(p.id).y));
  assert.ok(highestExternal > lowestInternal, "external parties should sit below the company's own");
});

test("the CEO Special Officer is one position, an individual contributor, leading nobody", () => {
  const officer = byId.get(9321)!;
  assert.equal(officer.name, "CEO Special Officer");
  // The words beside the box on the source describe this post; they are not a
  // second post, and no card is created for them.
  assert.equal(officer.jobTitle, "Individual Contributor");
  assert.equal(all.filter((p) => p.name === "CEO Special Officer").length, 1);
  assert.equal(all.filter((p) => p.name === "Individual Contributor").length, 0);
  // It leads nobody, on the source and here.
  assert.deepEqual(all.filter((p) => p.managerId === 9321).map((p) => p.name), []);
  assert.deepEqual(eduk8uSourceLinks.filter((l) => l.parentId === 9321), []);
  // Its line to the Group CEO is confirmed - by Dr. Roy rather than by the
  // drawing, which shows the words but no connector.
  assert.equal(officer.managerId, 9301);
  assert.equal(officer.confidence, "confirmed");
  assert.equal(reportingLineConfidence(officer), "confirmed");
});

test("a source note is a label, never a position", () => {
  assert.ok(eduk8uSourceNotes.length > 0);
  const names = new Set(all.map((position) => position.name));
  for (const note of eduk8uSourceNotes) {
    assert.ok(note.width > 0 && note.height > 0, `"${note.label}" has no place on the drawing`);
    assert.ok(!names.has(note.label), `"${note.label}" was also loaded as a position`);
  }
  // The BD reference box names four streams; none of them is a person.
  const streams = eduk8uSourceNotes.find((note) => note.label.startsWith("SALES / BD"));
  assert.ok(streams, "the SALES / BD reference box is missing");
  for (const stream of ["ICQA", "Australia Immersion Recruitment", "NOCN", "KLUST"]) {
    assert.ok(streams!.body?.includes(stream), `${stream} is missing from the reference box`);
    assert.ok(!names.has(stream), `${stream} was invented as a position`);
  }
});

test("interns report to everyone above them, as Dr. Roy confirmed", () => {
  // employees.manager_id holds one line because leave approval and team scope
  // need one unambiguous answer. The rest are additional reporting lines, drawn
  // on the chart and operationally inert. Together they must add up to what he
  // confirmed - not one line with the others quietly dropped.
  const expected: Record<number, number[]> = {
    9311: [9309, 9310],          // Marketing GD interns -> both marketing execs
    9308: [9305, 9306, 9307],    // Admin intern -> all three senior BD execs
    9315: [9312, 9313, 9314],    // Tech interns -> all three developers
  };
  for (const [child, managers] of Object.entries(expected)) {
    const id = Number(child);
    const primary = byId.get(id)!.managerId;
    const extra = eduk8uSourceLinks.filter((link) => link.childId === id).map((link) => link.parentId);
    assert.deepEqual([primary, ...extra].sort(), [...managers].sort(), `reporting lines for ${byId.get(id)!.name}`);
    for (const link of eduk8uSourceLinks.filter((l) => l.childId === id)) {
      assert.equal(link.confidence, "confirmed");
      assert.notEqual(link.parentId, primary, "an additional line must not repeat the operational one");
    }
  }
});

test("a filled position is still a position, with nobody invented to fill it", () => {
  const compliance = byId.get(9316)!;
  // Dr. Roy confirmed the post is filled; he did not say by whom.
  assert.equal(compliance.occupancy, "filled_unnamed");
  // So it stays a position, not a person, and carries no name of one.
  assert.equal(compliance.kind, "vacant");
  assert.equal(compliance.name, "Head of Compliance & Quality Management");

  // Nothing else on the chart claims to be occupied, and nothing claims to be
  // a person: the source names nobody.
  for (const position of all) {
    assert.notEqual(position.kind, "staff", `${position.name} claims to be an employed person`);
    if (position.id !== 9316) {
      assert.ok(position.occupancy === undefined || position.occupancy === "vacant", position.name);
    }
  }
});
