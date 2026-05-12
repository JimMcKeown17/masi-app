const fs = require('fs');
const { parse } = require('csv-parse/sync');

function parseCsvText(text) {
  return parse(text, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

function parseCsvFile(filePath) {
  return parseCsvText(fs.readFileSync(filePath, 'utf8'));
}

module.exports = {
  parseCsvFile,
  parseCsvText,
};
