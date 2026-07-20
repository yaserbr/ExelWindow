const fs = require('fs/promises');
const path = require('path');
const XLSX = require('xlsx');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

const EMPTY_DATA = {
  updatedAt: null,
  fileInfo: {
    fileName: null,
    sheetCount: 0,
    totalRows: 0,
    totalColumns: 0
  },
  sheets: []
};

function normalizeWhitespace(value) {
  return String(value).replace(/\u00a0/g, ' ').trim();
}

function isEmptyCell(value) {
  return value === null || value === undefined || normalizeWhitespace(value) === '';
}

function countNonEmptyCells(row) {
  if (!Array.isArray(row)) {
    return 0;
  }

  return row.filter((cell) => !isEmptyCell(cell)).length;
}

function normalizeHeader(value, originalIndex, usedHeaders) {
  const rawName = isEmptyCell(value) ? `Column ${originalIndex + 1}` : normalizeWhitespace(value);
  let candidate = rawName;
  let counter = 2;

  while (usedHeaders.has(candidate)) {
    candidate = `${rawName} (${counter})`;
    counter += 1;
  }

  usedHeaders.add(candidate);
  return candidate;
}

function normalizeCellValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (typeof value === 'string') {
    const trimmed = normalizeWhitespace(value);
    return trimmed === '' ? null : trimmed;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const fallbackValue = normalizeWhitespace(value);
  return fallbackValue === '' ? null : fallbackValue;
}

function normalizeDisplayCell(value) {
  const normalizedValue = normalizeCellValue(value);

  if (normalizedValue === null || normalizedValue === undefined) {
    return '';
  }

  return String(normalizedValue);
}

function isEmptyRow(row) {
  return Object.values(row).every(isEmptyCell);
}

function findNextNonEmptyCount(rows, currentIndex) {
  for (let index = currentIndex + 1; index < rows.length; index += 1) {
    const count = countNonEmptyCells(rows[index]);
    if (count > 0) {
      return count;
    }
  }

  return 0;
}

function scoreHeaderCandidate(rows, index) {
  const row = rows[index] || [];
  const values = row.filter((cell) => !isEmptyCell(cell)).map((cell) => normalizeWhitespace(cell));
  const nonEmptyCount = values.length;

  if (nonEmptyCount === 0) {
    return Number.NEGATIVE_INFINITY;
  }

  const uniqueCount = new Set(values).size;
  const duplicatePenalty = nonEmptyCount - uniqueCount;
  const textCount = values.filter((value) => Number.isNaN(Number(value))).length;
  const nextNonEmptyCount = findNextNonEmptyCount(rows, index);
  const titlePenalty = nonEmptyCount <= 2 && nextNonEmptyCount > nonEmptyCount ? 12 : 0;

  return (
    nonEmptyCount * 4 +
    Math.min(nonEmptyCount, nextNonEmptyCount) * 2 +
    uniqueCount +
    textCount -
    duplicatePenalty * 3 -
    titlePenalty -
    index * 0.2
  );
}

function findHeaderIndex(rows) {
  const searchLimit = Math.min(rows.length, 20);
  let bestIndex = -1;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < searchLimit; index += 1) {
    const score = scoreHeaderCandidate(rows, index);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function getRelevantColumnIndexes(headerRow, dataRows) {
  const maxLength = Math.max(
    headerRow.length,
    ...dataRows.map((row) => (Array.isArray(row) ? row.length : 0)),
    0
  );
  const indexes = [];

  for (let index = 0; index < maxLength; index += 1) {
    const hasHeader = !isEmptyCell(headerRow[index]);
    const hasData = dataRows.some((row) => Array.isArray(row) && !isEmptyCell(row[index]));

    if (hasHeader || hasData) {
      indexes.push(index);
    }
  }

  return indexes;
}

function getExcelHeaderRowNumber(worksheet, headerIndex) {
  const range = worksheet['!ref'] ? XLSX.utils.decode_range(worksheet['!ref']) : null;
  return range ? range.s.r + headerIndex + 1 : headerIndex + 1;
}

function parseSheet(workbook, sheetName) {
  const worksheet = workbook.Sheets[sheetName];
  const tableRows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false
  });
  const rawRows = XLSX.utils
    .sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      raw: true,
      blankrows: true
    })
    .map((row) => row.map(normalizeDisplayCell));

  const headerIndex = findHeaderIndex(tableRows);

  if (headerIndex === -1) {
    return {
      name: sheetName,
      range: worksheet?.['!ref'] || '',
      headerRowNumber: null,
      rawRows,
      columns: [],
      rows: []
    };
  }

  const headerRow = tableRows[headerIndex] || [];
  const rawDataRows = tableRows.slice(headerIndex + 1);
  const relevantColumnIndexes = getRelevantColumnIndexes(headerRow, rawDataRows);
  const usedHeaders = new Set();
  const columns = relevantColumnIndexes.map((columnIndex) =>
    normalizeHeader(headerRow[columnIndex], columnIndex, usedHeaders)
  );

  const rows = rawDataRows
    .map((rowValues) => {
      const row = {};

      relevantColumnIndexes.forEach((columnIndex, outputIndex) => {
        row[columns[outputIndex]] = normalizeCellValue(rowValues[columnIndex]);
      });

      return row;
    })
    .filter((row) => !isEmptyRow(row));

  return {
    name: sheetName,
    range: worksheet?.['!ref'] || '',
    headerRowNumber: getExcelHeaderRowNumber(worksheet, headerIndex),
    rawRows,
    columns,
    rows
  };
}

function buildFileInfo(originalName, sheets) {
  return {
    fileName: path.basename(originalName),
    sheetCount: sheets.length,
    totalRows: sheets.reduce((total, sheet) => total + sheet.rows.length, 0),
    totalColumns: sheets.reduce((total, sheet) => total + sheet.columns.length, 0),
    sheets: sheets.map((sheet) => ({
      name: sheet.name,
      rowCount: sheet.rows.length,
      columnCount: sheet.columns.length,
      range: sheet.range,
      headerRowNumber: sheet.headerRowNumber
    }))
  };
}

function normalizeStoredData(parsed) {
  if (Array.isArray(parsed?.sheets)) {
    const sheets = parsed.sheets.map((sheet) => ({
      name: sheet.name || 'Sheet',
      role: sheet.role || 'detail',
      range: sheet.range || '',
      headerRowNumber: sheet.headerRowNumber || null,
      rawRows: Array.isArray(sheet.rawRows) ? sheet.rawRows : [],
      columns: Array.isArray(sheet.columns) ? sheet.columns : [],
      rows: Array.isArray(sheet.rows) ? sheet.rows : []
    }));

    return {
      updatedAt: parsed.updatedAt || null,
      fileInfo: {
        fileName: parsed.fileInfo?.fileName || null,
        sheetCount: parsed.fileInfo?.sheetCount ?? sheets.length,
        totalRows: parsed.fileInfo?.totalRows ?? sheets.reduce((total, sheet) => total + sheet.rows.length, 0),
        totalColumns:
          parsed.fileInfo?.totalColumns ?? sheets.reduce((total, sheet) => total + sheet.columns.length, 0),
        sheets: parsed.fileInfo?.sheets || sheets.map((sheet) => ({
          name: sheet.name,
          rowCount: sheet.rows.length,
          columnCount: sheet.columns.length,
          range: sheet.range,
          headerRowNumber: sheet.headerRowNumber
        }))
      },
      sheets
    };
  }

  const legacySheet = {
    name: parsed?.fileInfo?.sheetName || 'Sheet1',
    role: 'detail',
    range: '',
    headerRowNumber: null,
    rawRows: [],
    columns: Array.isArray(parsed?.columns) ? parsed.columns : [],
    rows: Array.isArray(parsed?.rows) ? parsed.rows : []
  };

  return {
    updatedAt: parsed?.updatedAt || null,
    fileInfo: buildFileInfo(parsed?.fileInfo?.fileName || 'data.json', [legacySheet]),
    sheets: [legacySheet]
  };
}

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify(EMPTY_DATA, null, 2), 'utf8');
  }
}

async function loadStoredData() {
  await ensureDataFile();

  try {
    const fileContent = await fs.readFile(DATA_FILE, 'utf8');
    return normalizeStoredData(JSON.parse(fileContent));
  } catch {
    return { ...EMPTY_DATA, fileInfo: { ...EMPTY_DATA.fileInfo }, sheets: [] };
  }
}

function parseWorkbook(buffer, originalName) {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,
    cellFormula: false,
    cellHTML: false
  });

  if (!workbook.SheetNames.length) {
    const error = new Error('The Excel file does not contain any worksheets.');
    error.statusCode = 400;
    throw error;
  }

  const sheets = workbook.SheetNames.slice(0, 4).map((sheetName, index) => ({
    ...parseSheet(workbook, sheetName),
    role: index === 0 ? 'summary' : 'detail'
  }));

  return {
    updatedAt: new Date().toISOString(),
    fileInfo: buildFileInfo(originalName, sheets),
    sheets
  };
}

async function saveExtractedData(extractedData) {
  await ensureDataFile();
  await fs.writeFile(DATA_FILE, JSON.stringify(extractedData, null, 2), 'utf8');
  return extractedData;
}

async function replaceDataFromExcel(buffer, originalName) {
  const extractedData = parseWorkbook(buffer, originalName);
  return saveExtractedData(extractedData);
}

module.exports = {
  ensureDataFile,
  loadStoredData,
  replaceDataFromExcel
};
