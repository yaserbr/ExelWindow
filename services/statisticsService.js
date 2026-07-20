const MAX_CHARTS = 6;

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

const CHART_COLUMN_PRIORITY = [
  /status/i,
  /execution status/i,
  /defect severity/i,
  /severity/i,
  /assignedto/i,
  /assigned to/i,
  /channel/i,
  /priority/i,
  /category/i,
  /type/i,
  /impacted system/i,
  /used by/i
];

const LOW_VALUE_CHART_COLUMNS = [
  /description/i,
  /summary/i,
  /comment/i,
  /addon/i,
  /dependency/i,
  /rca/i,
  /reason/i,
  /msisdn/i,
  /imsi/i,
  /sim/i,
  /pin/i,
  /puk/i,
  /ki value/i,
  /tc no/i,
  /jira/i,
  /defect id/i
];

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
    return value ? 'نعم' : 'لا';
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

      return a[0].localeCompare(b[0], 'ar');
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

function getColumnPriority(column) {
  const priorityIndex = CHART_COLUMN_PRIORITY.findIndex((pattern) => pattern.test(column));
  return priorityIndex === -1 ? 100 : priorityIndex;
}

function isLowValueChartColumn(column) {
  return LOW_VALUE_CHART_COLUMNS.some((pattern) => pattern.test(column));
}

function truncateLabel(value) {
  const text = formatCellValue(value);
  return text.length > 48 ? `${text.slice(0, 45)}...` : text;
}

function buildLineChart(rows, dateColumn, numericColumn) {
  const monthlyValues = new Map();

  rows.forEach((row) => {
    const dateValue = parseDateValue(row[dateColumn]);
    const numericValue = parseNumberValue(row[numericColumn]);

    if (!dateValue || numericValue === null) {
      return;
    }

    const monthKey = dateValue.toISOString().slice(0, 7);
    monthlyValues.set(monthKey, (monthlyValues.get(monthKey) || 0) + numericValue);
  });

  const entries = [...monthlyValues.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  if (entries.length < 2) {
    return null;
  }

  return {
    id: `line-${dateColumn}-${numericColumn}`,
    type: 'line',
    title: `${numericColumn} حسب ${dateColumn}`,
    labels: entries.map(([month]) => month),
    datasets: [
      {
        label: numericColumn,
        data: entries.map(([, value]) => roundNumber(value))
      }
    ]
  };
}

function buildNumericSummaryChart(numericStats) {
  const entries = Object.entries(numericStats).slice(0, 8);

  if (entries.length < 2) {
    return null;
  }

  return {
    id: 'numeric-sums',
    type: 'bar',
    title: 'مجاميع الأعمدة الرقمية',
    labels: entries.map(([column]) => column),
    datasets: [
      {
        label: 'المجموع',
        data: entries.map(([, stat]) => stat.sum || 0)
      }
    ]
  };
}

function buildTextChart(column, stat) {
  if (!stat || stat.topValues.length < 2 || isLowValueChartColumn(column)) {
    return null;
  }

  const chartType = stat.uniqueCount <= 8 ? 'doughnut' : 'bar';

  return {
    id: `text-${column}`,
    type: chartType,
    title: `توزيع ${column}`,
    labels: stat.topValues.map((item) => truncateLabel(item.value)),
    datasets: [
      {
        label: column,
        data: stat.topValues.map((item) => item.count)
      }
    ]
  };
}

function buildChartData(rows, columnTypes, numericStats, textStats) {
  const charts = [];
  const firstDateColumn = columnTypes.date[0];
  const firstNumericColumn = columnTypes.numeric[0];

  if (firstDateColumn && firstNumericColumn) {
    const lineChart = buildLineChart(rows, firstDateColumn, firstNumericColumn);
    if (lineChart) {
      charts.push(lineChart);
    }
  }

  const textColumns = [...columnTypes.text].sort((a, b) => getColumnPriority(a) - getColumnPriority(b));

  for (const column of textColumns) {
    if (charts.length >= MAX_CHARTS) {
      break;
    }

    const textChart = buildTextChart(column, textStats[column]);
    if (textChart) {
      charts.push(textChart);
    }
  }

  const numericChart = buildNumericSummaryChart(numericStats);
  if (numericChart && charts.length < MAX_CHARTS) {
    charts.push(numericChart);
  }

  return charts.slice(0, MAX_CHARTS);
}

function buildSheetStatistics(sheet) {
  const rows = sheet.rows || [];
  const columns = sheet.columns || [];
  const columnTypes = analyzeColumns(rows, columns);
  const numericStats = buildNumericStatistics(rows, columnTypes.numeric);
  const textStats = buildTextStatistics(rows, columnTypes.text);
  const dateStats = buildDateStatistics(rows, columnTypes.date);
  const chartData = buildChartData(rows, columnTypes, numericStats, textStats);

  return {
    sheetName: sheet.name,
    range: sheet.range || '',
    headerRowNumber: sheet.headerRowNumber || null,
    fileInfo: {
      rowCount: rows.length,
      columnCount: columns.length
    },
    columnTypes,
    numericStats,
    textStats,
    dateStats,
    chartData
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

  return formatCellValue(a).localeCompare(formatCellValue(b), 'ar', {
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
