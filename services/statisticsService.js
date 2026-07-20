const ARABIC_DIGITS = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9'
};

function isEmptyValue(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function toWesternDigits(value) {
  return String(value).replace(/[٠-٩۰-۹]/g, (digit) => ARABIC_DIGITS[digit] || digit);
}

function parseNumberValue(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = toWesternDigits(value)
    .trim()
    .replace(/[,\s٬]/g, '')
    .replace(/٫/g, '.');

  if (!/^[-+]?\d+(\.\d+)?%?$/.test(normalized)) {
    return null;
  }

  const withoutPercent = normalized.replace('%', '');
  const numberValue = Number(withoutPercent);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function parseDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = toWesternDigits(value.trim());

  if (!/\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4}|T\d{2}:\d{2}:\d{2}/.test(normalized)) {
    return null;
  }

  const directDate = new Date(normalized);
  if (isReasonableDate(directDate)) {
    return directDate;
  }

  const dateParts = normalized.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (!dateParts) {
    return null;
  }

  const first = Number(dateParts[1]);
  const second = Number(dateParts[2]);
  const year = normalizeYear(Number(dateParts[3]));
  const day = first > 12 ? first : second;
  const month = first > 12 ? second : first;
  const fallbackDate = new Date(Date.UTC(year, month - 1, day));

  return isReasonableDate(fallbackDate) ? fallbackDate : null;
}

function normalizeYear(year) {
  if (year < 100) {
    return year >= 70 ? 1900 + year : 2000 + year;
  }

  return year;
}

function isReasonableDate(dateValue) {
  if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
    return false;
  }

  const year = dateValue.getUTCFullYear();
  return year >= 1900 && year <= 2200;
}

function formatCellValue(value) {
  if (isEmptyValue(value)) {
    return '';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  return String(value).trim();
}

function roundNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function analyzeColumns(rows, columns) {
  const details = {};
  const numeric = [];
  const text = [];
  const date = [];

  columns.forEach((column) => {
    const values = rows.map((row) => row[column]).filter((value) => !isEmptyValue(value));
    const emptyCount = rows.length - values.length;
    const numericCount = values.filter((value) => parseNumberValue(value) !== null).length;
    const dateCount = values.filter((value) => parseDateValue(value) !== null).length;

    const numericRatio = values.length === 0 ? 0 : numericCount / values.length;
    const dateRatio = values.length === 0 ? 0 : dateCount / values.length;

    let type = 'text';

    if (values.length > 0 && dateRatio >= 0.7) {
      type = 'date';
      date.push(column);
    } else if (values.length > 0 && numericRatio >= 0.8) {
      type = 'numeric';
      numeric.push(column);
    } else {
      text.push(column);
    }

    details[column] = {
      type,
      emptyCount,
      nonEmptyCount: values.length,
      numericCount,
      dateCount
    };
  });

  return {
    all: columns,
    numeric,
    text,
    date,
    details
  };
}

function buildNumericStatistics(rows, numericColumns) {
  return numericColumns.reduce((stats, column) => {
    const values = rows
      .map((row) => parseNumberValue(row[column]))
      .filter((value) => value !== null);

    const sum = values.reduce((total, value) => total + value, 0);

    stats[column] = {
      sum: roundNumber(sum),
      average: values.length ? roundNumber(sum / values.length) : null,
      max: values.length ? roundNumber(Math.max(...values)) : null,
      min: values.length ? roundNumber(Math.min(...values)) : null,
      count: values.length
    };

    return stats;
  }, {});
}

function buildTextStatistics(rows, textColumns) {
  return textColumns.reduce((stats, column) => {
    const frequencies = new Map();

    rows.forEach((row) => {
      const value = formatCellValue(row[column]);
      if (!value) {
        return;
      }

      frequencies.set(value, (frequencies.get(value) || 0) + 1);
    });

    const sortedEntries = [...frequencies.entries()].sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }

      return a[0].localeCompare(b[0], 'en');
    });

    stats[column] = {
      uniqueCount: frequencies.size,
      topValues: sortedEntries.slice(0, 5).map(([value, count]) => ({ value, count })),
      frequencies: Object.fromEntries(sortedEntries)
    };

    return stats;
  }, {});
}

function buildDateStatistics(rows, dateColumns) {
  return dateColumns.reduce((stats, column) => {
    const dates = rows
      .map((row) => parseDateValue(row[column]))
      .filter(Boolean)
      .sort((a, b) => a.getTime() - b.getTime());

    const monthlyCounts = {};

    dates.forEach((dateValue) => {
      const monthKey = dateValue.toISOString().slice(0, 7);
      monthlyCounts[monthKey] = (monthlyCounts[monthKey] || 0) + 1;
    });

    stats[column] = {
      oldest: dates[0] ? dates[0].toISOString() : null,
      latest: dates[dates.length - 1] ? dates[dates.length - 1].toISOString() : null,
      count: dates.length,
      monthlyCounts
    };

    return stats;
  }, {});
}

function buildSheetStatistics(sheet) {
  const rows = sheet.rows || [];
  const columns = sheet.columns || [];
  const columnTypes = analyzeColumns(rows, columns);
  const numericStats = buildNumericStatistics(rows, columnTypes.numeric);
  const textStats = buildTextStatistics(rows, columnTypes.text);
  const dateStats = buildDateStatistics(rows, columnTypes.date);

  return {
    sheetName: sheet.name,
    role: sheet.role || 'detail',
    range: sheet.range || '',
    headerRowNumber: sheet.headerRowNumber || null,
    rawRows: sheet.rawRows || [],
    fileInfo: {
      rowCount: rows.length,
      columnCount: columns.length
    },
    columnTypes,
    numericStats,
    textStats,
    dateStats
  };
}

function buildStatistics(storedData) {
  const sheets = (storedData.sheets || []).map((sheet) => buildSheetStatistics(sheet));

  return {
    fileInfo: {
      fileName: storedData.fileInfo?.fileName || null,
      sheetCount: sheets.length,
      totalRows: sheets.reduce((total, sheet) => total + sheet.fileInfo.rowCount, 0),
      totalColumns: sheets.reduce((total, sheet) => total + sheet.fileInfo.columnCount, 0),
      sheets: sheets.map((sheet) => ({
        name: sheet.sheetName,
        role: sheet.role,
        rowCount: sheet.fileInfo.rowCount,
        columnCount: sheet.fileInfo.columnCount,
        range: sheet.range,
        headerRowNumber: sheet.headerRowNumber
      }))
    },
    updatedAt: storedData.updatedAt || null,
    sheets
  };
}

function compareCellValues(a, b) {
  const aNumber = parseNumberValue(a);
  const bNumber = parseNumberValue(b);

  if (aNumber !== null && bNumber !== null) {
    return aNumber - bNumber;
  }

  const aDate = parseDateValue(a);
  const bDate = parseDateValue(b);

  if (aDate && bDate) {
    return aDate.getTime() - bDate.getTime();
  }

  return formatCellValue(a).localeCompare(formatCellValue(b), 'en', {
    numeric: true,
    sensitivity: 'base'
  });
}

module.exports = {
  buildStatistics,
  compareCellValues,
  formatCellValue,
  isEmptyValue
};
