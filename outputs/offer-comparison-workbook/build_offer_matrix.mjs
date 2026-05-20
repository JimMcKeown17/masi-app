import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const workbook = Workbook.create();
const summary = workbook.worksheets.add("Summary");
const matrix = workbook.worksheets.add("Offer Matrix");
const assumptions = workbook.worksheets.add("Assumptions");
const sources = workbook.worksheets.add("Source Notes");

const currencyFormat = '$#,##0';
const pctFormat = '0.0%';
const dateFormat = 'm/d/yyyy';

function setValues(sheet, range, values) {
  sheet.getRange(range).values = values;
}

function setFormulas(sheet, range, formulas) {
  sheet.getRange(range).formulas = formulas;
}

function styleHeader(range) {
  range.format = {
    fill: { type: "solid", color: "#1F4E78" },
    font: { color: "#FFFFFF", bold: true },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
  };
}

function styleSubheader(range) {
  range.format = {
    fill: { type: "solid", color: "#D9EAF7" },
    font: { bold: true },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
  };
}

function addThinBorders(range) {
  range.format.borders = { preset: "all", style: "thin", color: "#D1D5DB" };
}

setValues(assumptions, "A1:B7", [
  ["Assumption", "Value"],
  ["Listing broker fee rate", 0.025],
  ["Seller-side transfer tax rate", 0.01],
  ["Offer 3 escalation cap per user summary", 686000],
  ["Offer 3 appraisal gap cap", 11000],
  ["Default risk scale", "1 = lower risk, 5 = higher risk"],
  ["Notes", "Edit the blue assumption cells if your agent gives different numbers."],
]);
styleHeader(assumptions.getRange("A1:B1"));
assumptions.getRange("B2:B3").format.numberFormat = [[pctFormat], [pctFormat]];
assumptions.getRange("B4:B5").format.numberFormat = [[currencyFormat], [currencyFormat]];
assumptions.getRange("A1:B7").format.autofitColumns();
assumptions.getRange("A1:B7").format.autofitRows();
assumptions.getRange("B2:B5").format.fill = { type: "solid", color: "#D9EAF7" };
addThinBorders(assumptions.getRange("A1:B7"));

const headers = [
  "Offer",
  "Buyer",
  "Base Purchase Price",
  "Escalation Cap",
  "Escalation Increment",
  "Expected Final Price",
  "Deposit / Earnest Money",
  "Financing Type",
  "Mortgage Contingency",
  "Loan Amount / LTV",
  "Appraisal Contingency",
  "Appraisal Gap Coverage",
  "Minimum Appraisal Needed",
  "Inspection Contingencies",
  "Seller Concessions / Buyer Broker",
  "Buyer Broker Fee Rate",
  "Buyer Broker Fee Cost",
  "Transfer Tax Terms",
  "Seller Transfer Tax Rate",
  "Seller Transfer Tax Cost",
  "Settlement Date",
  "Extensions / Timing Flexibility",
  "Sale-of-Home Contingency",
  "Included Items",
  "Excluded Items Issue",
  "Net Before Listing Fee",
  "Estimated Listing Fee",
  "Estimated Net After Listing Fee",
  "Risk Rating",
  "Questions / Counterpoints",
];

setValues(matrix, "A1:AD1", [headers]);
styleHeader(matrix.getRange("A1:AD1"));

const offerRows = [
  [
    "Offer 1",
    "Ethan J. Hahn and Christina Hahn",
    640000,
    660000,
    2000,
    660000,
    12000,
    "Mortgage possible; large gift letter provided",
    "Waived",
    "Not specified in visible terms; gift letter says $660k available",
    "No ACA checked in ASR/PEA",
    0,
    null,
    "All standard inspections waived",
    "Seller pays buyer broker 2.5%; no closing-cost assist shown",
    0.025,
    null,
    "Split normally; no buyer payment of seller side stated",
    0.01,
    null,
    new Date("2026-06-12T00:00:00"),
    "No special extension term seen",
    "None seen",
    "Washer, dryer, dishwasher, stove, refrigerator",
    "All mirrors except bathroom mirrors remain; dining room chandelier; bird feeders/houses/baths; armillary sundial",
    null,
    null,
    null,
    3,
    "Escalation cap appears typed as $660,0000 in the PEA; ask agent to correct/confirm. Buyer-broker fee materially reduces net.",
  ],
  [
    "Offer 2",
    "Steven Mendes and Eva Mendes",
    640000,
    650000,
    1200,
    650000,
    10000,
    "Cash / no mortgage financing",
    "Not applicable; buyer will not obtain mortgage financing",
    "N/A",
    "No ACA checked in ASR/PEA",
    0,
    null,
    "All standard inspections waived",
    "No buyer broker fee or closing-cost assist shown",
    0,
    null,
    "Buyer pays seller's side of transfer tax",
    0,
    null,
    new Date("2026-06-10T00:00:00"),
    "No special extension term seen",
    "None seen",
    "All appliances in as-is condition at no additional monetary value",
    "All mirrors except upstairs bathroom mirrors; dining room chandelier; garage EV charger negotiable; exterior bird items and sundial",
    null,
    null,
    null,
    1,
    "Lowest cap of the three, but cleanest seller economics and lowest financing/appraisal risk.",
  ],
  [
    "Offer 3",
    "Shannon Henry and Petri Santala",
    656000,
    686000,
    null,
    686000,
    20000,
    "Conventional mortgage",
    "Elected",
    "$548,800 first mortgage / 80% LTV",
    "Custom additional term; ACA not checked",
    11000,
    null,
    "All standard inspections waived",
    "Seller pays buyer broker 2.5%; no closing-cost assist shown",
    0.025,
    null,
    "Split normally; no buyer payment of seller side stated",
    0.01,
    null,
    new Date("2026-06-30T00:00:00"),
    "Buyers agree to extend 30 days as needed",
    "None seen",
    "Washer/dryer, fridge, oven",
    "No exclusions typed in agreement section reviewed",
    null,
    null,
    null,
    4,
    "Highest possible gross price, but financing is contingent and appraisal gap is capped at $11k. At $686k, appraisal likely needs to be at least $675k.",
  ],
  [
    "Offer 4",
    "Christopher J. Campis and Maria Lourdes Abigaile Campis",
    651600,
    665700,
    5251,
    665700,
    15000,
    "Cash / no mortgage financing; proof of funds and designated family funds included",
    "Not applicable; buyer will not obtain mortgage financing",
    "N/A",
    "No ACA checked in ASR/PEA",
    0,
    null,
    "All standard inspections waived",
    "Seller pays buyer broker 2.5%; no closing-cost assist shown",
    0.025,
    null,
    "Split normally; no buyer payment of seller side stated",
    0.01,
    null,
    new Date("2026-06-02T00:00:00"),
    "Settlement date marked flexible",
    "None seen",
    "All appliances in as-is condition",
    "All mirrors except upstairs bathroom mirrors; dining room chandelier; garage EV charger; exterior bird items and sundial",
    null,
    null,
    null,
    2,
    "Strong cash/no-financing structure and waived inspections, but seller-paid buyer broker fee and seller transfer tax reduce net.",
  ],
];

setValues(matrix, "A2:AD5", offerRows);
setFormulas(matrix, "M2:M5", [
  ['=IF(L2>0,F2-L2,"N/A")'],
  ['=IF(L3>0,F3-L3,"N/A")'],
  ['=IF(L4>0,F4-L4,"N/A")'],
  ['=IF(L5>0,F5-L5,"N/A")'],
]);
setFormulas(matrix, "Q2:Q5", [
  ["=F2*P2"],
  ["=F3*P3"],
  ["=F4*P4"],
  ["=F5*P5"],
]);
setFormulas(matrix, "T2:T5", [
  ["=F2*S2"],
  ["=F3*S3"],
  ["=F4*S4"],
  ["=F5*S5"],
]);
setFormulas(matrix, "Z2:AB5", [
  ["=F2-Q2-T2", "=F2*Assumptions!$B$2", "=Z2-AA2"],
  ["=F3-Q3-T3", "=F3*Assumptions!$B$2", "=Z3-AA3"],
  ["=F4-Q4-T4", "=F4*Assumptions!$B$2", "=Z4-AA4"],
  ["=F5-Q5-T5", "=F5*Assumptions!$B$2", "=Z5-AA5"],
]);

matrix.getRange("C2:G5").format.numberFormat = [
  [currencyFormat, currencyFormat, currencyFormat, currencyFormat, currencyFormat],
  [currencyFormat, currencyFormat, currencyFormat, currencyFormat, currencyFormat],
  [currencyFormat, currencyFormat, currencyFormat, currencyFormat, currencyFormat],
  [currencyFormat, currencyFormat, currencyFormat, currencyFormat, currencyFormat],
];
matrix.getRange("L2:M5").format.numberFormat = [
  [currencyFormat, currencyFormat],
  [currencyFormat, currencyFormat],
  [currencyFormat, currencyFormat],
  [currencyFormat, currencyFormat],
];
matrix.getRange("P2:T5").format.numberFormat = [
  [pctFormat, currencyFormat, "General", pctFormat, currencyFormat],
  [pctFormat, currencyFormat, "General", pctFormat, currencyFormat],
  [pctFormat, currencyFormat, "General", pctFormat, currencyFormat],
  [pctFormat, currencyFormat, "General", pctFormat, currencyFormat],
];
matrix.getRange("U2:U5").format.numberFormat = [[dateFormat], [dateFormat], [dateFormat], [dateFormat]];
matrix.getRange("Z2:AB5").format.numberFormat = [
  [currencyFormat, currencyFormat, currencyFormat],
  [currencyFormat, currencyFormat, currencyFormat],
  [currencyFormat, currencyFormat, currencyFormat],
  [currencyFormat, currencyFormat, currencyFormat],
];

matrix.getRange("A1:AD5").format.verticalAlignment = "top";
matrix.getRange("A1:AD5").format.wrapText = true;
addThinBorders(matrix.getRange("A1:AD5"));

const matrixWidths = {
  A: 82, B: 190, C: 118, D: 118, E: 112, F: 128, G: 120, H: 165, I: 160,
  J: 178, K: 150, L: 122, M: 130, N: 180, O: 210, P: 96, Q: 118, R: 170,
  S: 105, T: 118, U: 112, V: 180, W: 140, X: 190, Y: 215, Z: 130, AA: 126,
  AB: 140, AC: 90, AD: 270,
};
for (const [col, width] of Object.entries(matrixWidths)) {
  matrix.getRange(`${col}:${col}`).format.columnWidth = width;
}
matrix.getRange("1:1").format.rowHeight = 54;
matrix.getRange("2:5").format.rowHeight = 104;
matrix.freezePanes.freezeRows(1);

setValues(summary, "A1:F1", [["Offer Comparison Summary", "", "", "", "", ""]]);
summary.getRange("A1:F1").merge();
summary.getRange("A1:F1").format = {
  fill: { type: "solid", color: "#1F4E78" },
  font: { color: "#FFFFFF", bold: true, size: 16 },
};

setValues(summary, "A3:F3", [["Offer", "Expected Final Price", "Buyer Broker Fee", "Seller Transfer Tax", "Net Before Listing Fee", "Risk Rating"]]);
styleSubheader(summary.getRange("A3:F3"));
setFormulas(summary, "A4:F7", [
  ['=\'Offer Matrix\'!A2', '=\'Offer Matrix\'!F2', '=\'Offer Matrix\'!Q2', '=\'Offer Matrix\'!T2', '=\'Offer Matrix\'!Z2', '=\'Offer Matrix\'!AC2'],
  ['=\'Offer Matrix\'!A3', '=\'Offer Matrix\'!F3', '=\'Offer Matrix\'!Q3', '=\'Offer Matrix\'!T3', '=\'Offer Matrix\'!Z3', '=\'Offer Matrix\'!AC3'],
  ['=\'Offer Matrix\'!A4', '=\'Offer Matrix\'!F4', '=\'Offer Matrix\'!Q4', '=\'Offer Matrix\'!T4', '=\'Offer Matrix\'!Z4', '=\'Offer Matrix\'!AC4'],
  ['=\'Offer Matrix\'!A5', '=\'Offer Matrix\'!F5', '=\'Offer Matrix\'!Q5', '=\'Offer Matrix\'!T5', '=\'Offer Matrix\'!Z5', '=\'Offer Matrix\'!AC5'],
]);
summary.getRange("B4:E7").format.numberFormat = [
  [currencyFormat, currencyFormat, currencyFormat, currencyFormat],
  [currencyFormat, currencyFormat, currencyFormat, currencyFormat],
  [currencyFormat, currencyFormat, currencyFormat, currencyFormat],
  [currencyFormat, currencyFormat, currencyFormat, currencyFormat],
];
addThinBorders(summary.getRange("A3:F7"));

setValues(summary, "A9:F9", [["Best By Category", "", "", "", "", ""]]);
summary.getRange("A9:F9").merge();
summary.getRange("A9:F9").format = {
  fill: { type: "solid", color: "#D9EAF7" },
  font: { bold: true },
};
setValues(summary, "A10:B14", [
  ["Highest expected final price", ""],
  ["Highest net before listing fee", ""],
  ["Lowest risk rating", ""],
  ["Cleanest financing/appraisal risk", "Offer 2"],
  ["Biggest clarification needed", "Offer 3 appraisal/financing and Offer 1 typo"],
]);
setFormulas(summary, "B10:B12", [
  ['=INDEX(A4:A7,MATCH(MAX(B4:B7),B4:B7,0))'],
  ['=INDEX(A4:A7,MATCH(MAX(E4:E7),E4:E7,0))'],
  ['=INDEX(A4:A7,MATCH(MIN(F4:F7),F4:F7,0))'],
]);
addThinBorders(summary.getRange("A10:B14"));

setValues(summary, "D10:F15", [
  ["Quick Notes", "", ""],
  ["Offer 1", "Strong personal/gift support, but seller-paid buyer broker fee reduces net.", ""],
  ["Offer 2", "Lowest max price but cleanest terms: cash/no mortgage, waived inspections, buyer pays seller transfer tax.", ""],
  ["Offer 3", "Highest possible gross price, but mortgage contingency and $11k appraisal gap cap need scrutiny.", ""],
  ["Offer 4", "Cash/no mortgage and waived inspections; net is reduced by buyer broker fee and normal seller transfer tax.", ""],
  ["Next step", "Ask agent for official net sheets and confirmation of buyer broker compensation for each offer.", ""],
]);
summary.getRange("D10:F10").merge();
styleSubheader(summary.getRange("D10:F10"));
summary.getRange("D11:D15").format.font = { bold: true };
summary.getRange("D10:F15").format.wrapText = true;
addThinBorders(summary.getRange("D10:F15"));

summary.getRange("A:F").format.autofitColumns();
summary.getRange("A1:F15").format.autofitRows();
summary.getRange("A1:F15").format.verticalAlignment = "top";
summary.freezePanes.freezeRows(3);

setValues(sources, "A1:D1", [["Offer", "File / Source", "Key Values Used", "Caveats"]]);
styleHeader(sources.getRange("A1:D1"));
setValues(sources, "A2:D5", [
  [
    "Offer 1",
    "Offer 1 - Updated Offer!.pdf; Offer 1 - Gift Letter from James Hahn.pdf",
    "Base $640k; escalation +$2k to apparent $660k cap; deposit $12k; waived mortgage contingency; inspections waived; seller pays buyer broker 2.5%; settlement 6/12/2026; gift letter states $660k available.",
    "PEA cap appears typoed as $660,0000. No ACA checked in reviewed agreement.",
  ],
  [
    "Offer 2",
    "Offer 2.pdf",
    "Base $640k; escalation +$1.2k to $650k cap; deposit $10k; cash/no mortgage financing; inspections waived; buyer pays seller-side transfer tax; settlement 6/10/2026.",
    "Acceptance-date field appears amended/duplicative; confirm with agent.",
  ],
  [
    "Offer 3",
    "Standard Agreement For The Sale of Real Estate (PAR ASR) (14).pdf plus user summary",
    "Base $656k; user-provided escalation cap $686k; deposit $20k; conventional financing contingency elected; loan $548,800 at 80% LTV; inspections waived; buyer broker 2.5%; $11k appraisal gap clause; settlement 6/30/2026.",
    "PEA itself was referenced but not in the reviewed 14-page PDF. Additional term says appraisal gap, but ACA is not checked.",
  ],
  [
    "Offer 4",
    "fwdofferforclarencedrivefrompattieheinerealtor folder: 1847 Clarence Dr. AOS.pdf; 1847 Clarence Dr., Price Escalation.pdf; Buyers Financial Information (2).pdf; Designation of Funds.pdf",
    "Base $651,600; escalation +$5,251 to $665,700 cap; deposit $15k; no mortgage financing; inspections waived; buyer broker 2.5%; no appraisal addendum checked; settlement 6/2/2026 flexible; buyer financial statement shows $1.13M+ assets and designated funds letter.",
    "AOS and PEA are scanned, so key fields were read from rendered pages. Transfer taxes default to normal split because no alternate term was typed.",
  ],
]);
sources.getRange("A1:D5").format.wrapText = true;
sources.getRange("A1:D5").format.verticalAlignment = "top";
addThinBorders(sources.getRange("A1:D5"));
sources.getRange("A:A").format.columnWidth = 90;
sources.getRange("B:B").format.columnWidth = 260;
sources.getRange("C:C").format.columnWidth = 470;
sources.getRange("D:D").format.columnWidth = 330;
sources.getRange("1:1").format.rowHeight = 34;
sources.getRange("2:5").format.rowHeight = 118;

for (const sheet of [summary, matrix, assumptions, sources]) {
  sheet.getUsedRange().format.font = { name: "Aptos", size: 11 };
}

const outputDir = "/Users/jimmckeown/Development/masi-app/outputs/offer-comparison-workbook/exports";
await fs.mkdir(outputDir, { recursive: true });

const summaryInspect = await workbook.inspect({
  kind: "table",
  range: "Summary!A1:F15",
  include: "values,formulas",
  tableMaxRows: 20,
  tableMaxCols: 8,
});
console.log(summaryInspect.ndjson);

const matrixInspect = await workbook.inspect({
  kind: "table",
  range: "Offer Matrix!A1:AD5",
  include: "values,formulas",
  tableMaxRows: 8,
  tableMaxCols: 30,
});
console.log(matrixInspect.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

await workbook.render({ sheetName: "Summary", range: "A1:F15", scale: 1 });
await workbook.render({ sheetName: "Offer Matrix", range: "A1:AD5", scale: 1 });
await workbook.render({ sheetName: "Assumptions", range: "A1:B7", scale: 1 });
await workbook.render({ sheetName: "Source Notes", range: "A1:D5", scale: 1 });

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/home_offer_comparison_matrix.xlsx`);
console.log(`${outputDir}/home_offer_comparison_matrix.xlsx`);
