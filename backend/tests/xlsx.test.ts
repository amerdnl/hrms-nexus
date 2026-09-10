import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { formatSenExact } from "../src/utils/payrollMoney.js";
import {
  buildWorkbook, MAX_WORKBOOK_ROWS, sheetName, WorkbookTooLargeError,
} from "../src/utils/xlsx.js";

async function read(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

test("a text cell that looks like a formula is neutralised", async () => {
  const hostile = [
    "=cmd|' /C calc'!A0",
    "+1+1",
    "-2+3+cmd|' /C calc'!A0",
    "@SUM(1:2)",
    "\t=1+1",
    "   =1+1",
  ];
  const buffer = await buildWorkbook([
    { name: "Hostile", headers: ["Value"], rows: hostile.map((value) => [value]) },
  ]);

  const sheet = (await read(buffer)).getWorksheet("Hostile")!;
  hostile.forEach((original, index) => {
    const cell = sheet.getRow(index + 2).getCell(1);
    assert.equal(typeof cell.value, "string", "a neutralised cell stays a string");
    assert.equal(cell.value, `'${original}`);
    // And it is emphatically not stored as something the reader will evaluate.
    // ExcelJS always defines a `formula` accessor, so its value is what matters,
    // not whether the property exists.
    assert.equal(cell.type, ExcelJS.ValueType.String);
    assert.equal(cell.formula, undefined);
  });
});

test("a negative amount is left alone, because it is a number not a formula", async () => {
  const buffer = await buildWorkbook([
    { name: "Money", headers: ["Amount"], rows: [["-272.73"], ["-1"], ["0.00"]] },
  ]);
  const sheet = (await read(buffer)).getWorksheet("Money")!;
  assert.equal(sheet.getRow(2).getCell(1).value, "-272.73");
  assert.equal(sheet.getRow(3).getCell(1).value, "-1");
  assert.equal(sheet.getRow(4).getCell(1).value, "0.00");
});

test("money keeps every sen, and never becomes a float", async () => {
  // 1234567 sen is 12345.67; as a JavaScript number 1234567 / 100 is not
  // exactly representable, which is the whole reason money is carried as text.
  const amounts = ["1234567", "1", "0", "999999999", "100"];
  const buffer = await buildWorkbook([
    {
      name: "Payroll",
      headers: ["Net (MYR)"],
      rows: amounts.map((sen) => [formatSenExact(sen)]),
    },
  ]);

  const sheet = (await read(buffer)).getWorksheet("Payroll")!;
  const expected = ["12345.67", "0.01", "0.00", "9999999.99", "1.00"];
  expected.forEach((text, index) => {
    const cell = sheet.getRow(index + 2).getCell(1);
    assert.equal(cell.value, text);
    assert.equal(typeof cell.value, "string", "money must not be written as a number");
  });
});

test("safe integers are written as numbers, so ids and counts still sort", async () => {
  const buffer = await buildWorkbook([
    { name: "Counts", headers: ["ID", "Rows"], rows: [[42, 0], [7, 1500]] },
  ]);
  const sheet = (await read(buffer)).getWorksheet("Counts")!;
  assert.equal(sheet.getRow(2).getCell(1).value, 42);
  assert.equal(typeof sheet.getRow(2).getCell(1).value, "number");
  assert.equal(sheet.getRow(3).getCell(2).value, 1500);
});

test("a non-integer number is written as text rather than silently rounded", async () => {
  const buffer = await buildWorkbook([
    { name: "Odd", headers: ["Value"], rows: [[0.1 + 0.2]] },
  ]);
  const cell = (await read(buffer)).getWorksheet("Odd")!.getRow(2).getCell(1);
  assert.equal(typeof cell.value, "string");
  assert.equal(cell.value, "0.30000000000000004");
});

test("booleans read as words rather than TRUE/FALSE", async () => {
  const buffer = await buildWorkbook([
    { name: "Flags", headers: ["Active"], rows: [[true], [false]] },
  ]);
  const sheet = (await read(buffer)).getWorksheet("Flags")!;
  assert.equal(sheet.getRow(2).getCell(1).value, "yes");
  assert.equal(sheet.getRow(3).getCell(1).value, "no");
});

test("sheet names are made legal, and collisions are resolved", () => {
  assert.equal(sheetName("Payroll: records"), "Payroll  records");
  assert.equal(sheetName("a/b\\c[d]e*f?g"), "a b c d e f g");
  assert.equal(sheetName(""), "Sheet");
  assert.equal(sheetName("x".repeat(50)).length, 31);
});

test("two sheets wanting the same name both survive", async () => {
  const buffer = await buildWorkbook([
    { name: "Leave: requests", headers: ["A"], rows: [] },
    { name: "Leave/requests", headers: ["B"], rows: [] },
  ]);
  const workbook = await read(buffer);
  assert.equal(workbook.worksheets.length, 2);
  assert.notEqual(workbook.worksheets[0]!.name, workbook.worksheets[1]!.name);
});

test("no sheet is hidden", async () => {
  const buffer = await buildWorkbook([
    { name: "One", headers: ["A"], rows: [["x"]] },
    { name: "Two", headers: ["B"], rows: [] },
  ]);
  for (const sheet of (await read(buffer)).worksheets) {
    assert.equal(sheet.state, "visible", `${sheet.name} must be visible`);
  }
});

test("an empty dataset says so in words", async () => {
  const buffer = await buildWorkbook([
    { name: "Empty", headers: ["A", "B"], rows: [], emptyNote: "No records." },
  ]);
  const sheet = (await read(buffer)).getWorksheet("Empty")!;
  assert.deepEqual([sheet.getRow(1).getCell(1).value, sheet.getRow(1).getCell(2).value], ["A", "B"]);
  assert.equal(sheet.getRow(2).getCell(1).value, "No records.");
});

test("a workbook over the row ceiling is refused, not truncated", async () => {
  const rows = Array.from({ length: MAX_WORKBOOK_ROWS + 1 }, (_, index) => [index]);
  await assert.rejects(
    () => buildWorkbook([{ name: "Huge", headers: ["N"], rows }]),
    (error: unknown) => {
      assert.ok(error instanceof WorkbookTooLargeError);
      assert.match(error.message, /over the 100000 row limit/);
      return true;
    },
  );
});

test("the ceiling counts the whole workbook, not each sheet alone", async () => {
  const half = Math.ceil(MAX_WORKBOOK_ROWS / 2) + 1;
  const rows = Array.from({ length: half }, (_, index) => [index]);
  await assert.rejects(
    () => buildWorkbook([
      { name: "A", headers: ["N"], rows },
      { name: "B", headers: ["N"], rows },
    ]),
    WorkbookTooLargeError,
  );
});

test("the same data produces the same cells every time", async () => {
  const spec = [{
    name: "Repeat",
    headers: ["A", "B"],
    rows: [["=1+1", 5], ["plain", 6]],
  }];
  const [first, second] = await Promise.all([buildWorkbook(spec), buildWorkbook(spec)]);

  const cells = async (buffer: Buffer) => {
    const sheet = (await read(buffer)).getWorksheet("Repeat")!;
    const values: unknown[][] = [];
    sheet.eachRow((row) => values.push([row.getCell(1).value, row.getCell(2).value]));
    return values;
  };

  // Cell content, not bytes: an xlsx carries a creation timestamp, so two files
  // written a millisecond apart are legitimately different files.
  assert.deepEqual(await cells(first), await cells(second));
});
