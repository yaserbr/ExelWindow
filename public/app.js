const state = {
  statistics: null,
  activeSheet: '',
  selectedColumn: '',
  columnFilters: {},
  visibleFilterColumns: {},
  chartInstances: []
};

const elements = {
  messageBox: document.getElementById('messageBox'),
  loadingState: document.getElementById('loadingState'),
  emptyState: document.getElementById('emptyState'),
  dashboardContent: document.getElementById('dashboardContent'),
  firstSheetPanel: document.getElementById('firstSheetPanel'),
  firstSheetTitle: document.getElementById('firstSheetTitle'),
  lastUpdateTime: document.getElementById('lastUpdateTime'),
  firstSheetTables: document.getElementById('firstSheetTables'),
  sheetTabs: document.getElementById('sheetTabs'),
  dataSheetTitle: document.getElementById('dataSheetTitle'),
  columnsList: document.getElementById('columnsList'),
  dataFilters: document.getElementById('dataFilters'),
  dataRowCount: document.getElementById('dataRowCount'),
  clearDataFilters: document.getElementById('clearDataFilters'),
  dataTableContainer: document.getElementById('dataTableContainer'),
  selectedColumnPanel: document.getElementById('selectedColumnPanel'),
  selectedColumnTitle: document.getElementById('selectedColumnTitle'),
  barChartTitle: document.getElementById('barChartTitle'),
  barChartCanvas: document.getElementById('barChartCanvas'),
  doughnutChartTitle: document.getElementById('doughnutChartTitle'),
  doughnutChartCanvas: document.getElementById('doughnutChartCanvas'),
  openUploadModal: document.getElementById('openUploadModal'),
  uploadModal: document.getElementById('uploadModal'),
  uploadForm: document.getElementById('uploadForm'),
  excelFile: document.getElementById('excelFile'),
  uploadStatus: document.getElementById('uploadStatus'),
  uploadButton: document.getElementById('uploadButton')
};

const chartColors = ['#1264d8', '#10a37f', '#4f46e5', '#0891b2', '#65a30d', '#dc2626'];

function formatNumber(value) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2
  }).format(value);
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium'
  }).format(dateValue);
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(dateValue);
}

function clearElement(element) {
  element.replaceChildren();
}

function createTextElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  element.textContent = text;
  return element;
}

function formatSummaryTableCell(cell, columnLabel) {
  const text = String(cell || '');
  const normalizedLabel = String(columnLabel || '').trim().toLowerCase();

  if (normalizedLabel === 'pass %' && text.trim() !== '') {
    const numericValue = Number(text);

    if (Number.isFinite(numericValue)) {
      const percentValue = Math.abs(numericValue) <= 1 ? numericValue * 100 : numericValue;

      return `${new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 1
      }).format(percentValue)}%`;
    }
  }

  return text;
}

function setMessage(text, type = 'success') {
  elements.messageBox.textContent = text;
  elements.messageBox.className = `message-box active ${type}`;

  window.setTimeout(() => {
    elements.messageBox.textContent = '';
    elements.messageBox.className = 'message-box';
  }, 4500);
}

function setMainLoading(isLoading) {
  elements.loadingState.classList.toggle('hidden', !isLoading);
}

function getFirstWorkbookSheet() {
  return state.statistics?.sheets?.[0] || null;
}

function getDetailSheets() {
  return (state.statistics?.sheets || []).slice(1);
}

function getActiveSheetStats() {
  const detailSheets = getDetailSheets();
  return detailSheets.find((sheet) => sheet.sheetName === state.activeSheet) || detailSheets[0] || null;
}

function getActiveFilters() {
  if (!state.columnFilters[state.activeSheet]) {
    state.columnFilters[state.activeSheet] = {};
  }

  return state.columnFilters[state.activeSheet];
}

function getVisibleFilterColumns(sheetStatistics = getActiveSheetStats()) {
  if (!state.activeSheet || !sheetStatistics) {
    return [];
  }

  if (!state.visibleFilterColumns[state.activeSheet]?.length && state.selectedColumn) {
    state.visibleFilterColumns[state.activeSheet] = [state.selectedColumn];
  }

  const availableColumns = new Set(sheetStatistics.columns || []);
  return (state.visibleFilterColumns[state.activeSheet] || []).filter((column) => availableColumns.has(column));
}

function setVisibleFilterColumns(columns) {
  if (!state.activeSheet) {
    return;
  }

  state.visibleFilterColumns[state.activeSheet] = [...new Set(columns.filter(Boolean))];
}

function isBlankRow(row) {
  return !row || row.every((cell) => String(cell || '').trim() === '');
}

function trimRows(rows) {
  const normalizedRows = (rows || []).map((row) => (Array.isArray(row) ? row : []));
  let lastRowIndex = normalizedRows.length - 1;

  while (lastRowIndex >= 0 && isBlankRow(normalizedRows[lastRowIndex])) {
    lastRowIndex -= 1;
  }

  const usedRows = normalizedRows.slice(0, lastRowIndex + 1);
  const maxColumns = usedRows.reduce((max, row) => {
    let lastCellIndex = row.length - 1;

    while (lastCellIndex >= 0 && String(row[lastCellIndex] || '').trim() === '') {
      lastCellIndex -= 1;
    }

    return Math.max(max, lastCellIndex + 1);
  }, 0);

  return usedRows.map((row) => row.slice(0, maxColumns));
}

function splitIntoTables(rows) {
  const tables = [];
  let currentTable = [];

  trimRows(rows).forEach((row) => {
    if (isBlankRow(row)) {
      if (currentTable.length) {
        tables.push(currentTable);
        currentTable = [];
      }
      return;
    }

    currentTable.push(row);
  });

  if (currentTable.length) {
    tables.push(currentTable);
  }

  return tables.flatMap(splitTableByBlankColumns);
}

function getUsedColumnRuns(rows) {
  const maxColumns = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const runs = [];
  let runStart = null;

  for (let index = 0; index < maxColumns; index += 1) {
    const hasValue = rows.some((row) => String(row[index] || '').trim() !== '');

    if (hasValue && runStart === null) {
      runStart = index;
    } else if (!hasValue && runStart !== null) {
      runs.push({ start: runStart, end: index - 1 });
      runStart = null;
    }
  }

  if (runStart !== null) {
    runs.push({ start: runStart, end: maxColumns - 1 });
  }

  return runs;
}

function splitTableByBlankColumns(rows) {
  const columnRuns = getUsedColumnRuns(rows);

  return columnRuns
    .map((run) => trimRows(rows.map((row) => row.slice(run.start, run.end + 1))))
    .filter((tableRows) => tableRows.some((row) => !isBlankRow(row)));
}

function compactTableRows(rows) {
  const maxColumns = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const usedColumnIndexes = [];

  for (let index = 0; index < maxColumns; index += 1) {
    if (rows.some((row) => String(row[index] || '').trim() !== '')) {
      usedColumnIndexes.push(index);
    }
  }

  return rows.map((row) => usedColumnIndexes.map((index) => row[index] || ''));
}

function renderFirstSheet() {
  const firstSheet = getFirstWorkbookSheet();
  clearElement(elements.firstSheetTables);

  if (!firstSheet || !firstSheet.rawRows?.length) {
    elements.firstSheetPanel.classList.add('hidden');
    return;
  }

  elements.firstSheetTitle.textContent = firstSheet.sheetName;
  elements.lastUpdateTime.textContent = `Last Update: ${formatDateTime(state.statistics?.updatedAt)}`;

  splitIntoTables(firstSheet.rawRows).forEach((sourceRows) => {
    const rows = compactTableRows(sourceRows);
    const firstRowValues = rows[0]?.filter((cell) => String(cell || '').trim() !== '') || [];
    const hasStandaloneTitle = firstRowValues.length === 1 && rows.length > 1;
    const titleText = hasStandaloneTitle ? String(firstRowValues[0]).trim() : '';
    const shouldShowTitle = titleText && titleText.toLowerCase() !== firstSheet.sheetName.toLowerCase();
    const tableRows = hasStandaloneTitle ? rows.slice(1) : rows;
    const tableColumnCount = tableRows.reduce((max, row) => Math.max(max, row.length), 0);

    if (!tableColumnCount) {
      return;
    }

    const tableCard = document.createElement('article');
    tableCard.className = `mini-table-card${tableColumnCount >= 10 ? ' mini-table-card-wide' : ''}`;

    if (shouldShowTitle) {
      tableCard.append(createTextElement('h3', '', titleText));
    }

    const table = document.createElement('table');
    table.className = `mini-table${tableColumnCount >= 10 ? ' mini-table-wide' : ' mini-table-compact'}`;
    const headerRow = tableRows[0] || [];

    tableRows.forEach((row, rowIndex) => {
      const tableRow = document.createElement('tr');
      const filledCells = row.filter((cell) => String(cell || '').trim() !== '').length;

      row.forEach((cell, cellIndex) => {
        const cellElement = document.createElement(rowIndex === 0 && filledCells > 1 ? 'th' : 'td');
        cellElement.textContent = formatSummaryTableCell(cell, rowIndex > 0 ? headerRow[cellIndex] : '');
        tableRow.append(cellElement);
      });

      table.append(tableRow);
    });

    tableCard.append(table);
    elements.firstSheetTables.append(tableCard);
  });

  elements.firstSheetPanel.classList.remove('hidden');
}

function renderSheetTabs() {
  clearElement(elements.sheetTabs);

  const detailSheets = getDetailSheets();
  if (!detailSheets.length) {
    elements.sheetTabs.append(createTextElement('p', 'muted-text', 'No detail sheets found.'));
    return;
  }

  detailSheets.forEach((sheet) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `sheet-tab${sheet.sheetName === state.activeSheet ? ' active' : ''}`;
    button.dataset.sheet = sheet.sheetName;
    button.textContent = sheet.sheetName;
    elements.sheetTabs.append(button);
  });
}

function renderColumnButtons(sheetStatistics) {
  clearElement(elements.columnsList);

  const columns = sheetStatistics?.columnTypes?.all || [];
  if (!columns.length) {
    elements.columnsList.append(createTextElement('p', 'muted-text', 'No columns found in this sheet.'));
    return;
  }

  columns.forEach((column) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `column-button${state.selectedColumn === column ? ' active' : ''}`;
    button.dataset.column = column;
    button.textContent = column;
    elements.columnsList.append(button);
  });
}

function formatDataValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

function getDataColumnWidth(column, rows) {
  const sampleRows = rows.slice(0, 120);
  const cellValues = sampleRows.map((row) => formatDataValue(row[column]));
  const longestCellLength = cellValues.reduce((max, value) => Math.max(max, value.length), 0);
  const headerLength = column.length;
  const longestValueLength = Math.max(headerLength, longestCellLength);
  const hasLongText = cellValues.some((value) => value.length > 34 || (/\s/.test(value) && value.length > 20));

  if (longestCellLength <= 3) {
    return Math.min(64, Math.max(46, headerLength * 5 + 14));
  }

  if (longestValueLength <= 8 && !hasLongText) {
    return Math.min(76, Math.max(54, longestValueLength * 5 + 16));
  }

  if (longestValueLength <= 12 && !hasLongText) {
    return Math.min(88, Math.max(66, longestValueLength * 5 + 16));
  }

  if (longestValueLength <= 22 && !hasLongText) {
    return Math.min(120, Math.max(88, longestValueLength * 4.8 + 18));
  }

  const normalizedColumn = column.toLowerCase();
  let maxWidth = 190;

  if (normalizedColumn.includes('description') || normalizedColumn.includes('summary')) {
    maxWidth = 220;
  } else if (normalizedColumn.includes('comment')) {
    maxWidth = 150;
  } else if (normalizedColumn.includes('addon') || normalizedColumn.includes('covered')) {
    maxWidth = 180;
  }

  return Math.min(maxWidth, Math.max(120, longestValueLength * 4.8));
}

function isFlexibleDataColumn(column) {
  const normalizedColumn = column.toLowerCase();

  return (
    normalizedColumn.includes('description') ||
    normalizedColumn.includes('comment') ||
    normalizedColumn.includes('addon') ||
    normalizedColumn.includes('covered') ||
    normalizedColumn.includes('function') ||
    normalizedColumn.includes('assigned') ||
    normalizedColumn.includes('category') ||
    normalizedColumn.includes('channel')
  );
}

function getDataColumnWidths(columns, rows) {
  const baseWidths = columns.map((column) => getDataColumnWidth(column, rows));
  const availableWidth = Math.max(0, elements.dataTableContainer.clientWidth - 2);
  const totalBaseWidth = baseWidths.reduce((total, width) => total + width, 0);

  if (!availableWidth || totalBaseWidth >= availableWidth) {
    return baseWidths;
  }

  const extraWidth = availableWidth - totalBaseWidth;
  const flexibleIndexes = columns.reduce((indexes, column, index) => {
    if (isFlexibleDataColumn(column)) {
      indexes.push(index);
    }
    return indexes;
  }, []);
  const targetIndexes = flexibleIndexes.length ? flexibleIndexes : columns.map((column, index) => index);
  const extraPerColumn = extraWidth / targetIndexes.length;

  return baseWidths.map((width, index) => (targetIndexes.includes(index) ? width + extraPerColumn : width));
}

function getColumnFilterOptions(rows, column) {
  const values = new Set();
  let hasBlank = false;

  rows.forEach((row) => {
    const value = formatDataValue(row[column]);

    if (!value) {
      hasBlank = true;
      return;
    }

    values.add(value);
  });

  const sortedValues = [...values].sort((a, b) =>
    a.localeCompare(b, 'en', {
      numeric: true,
      sensitivity: 'base'
    })
  );

  return {
    hasBlank,
    values: sortedValues
  };
}

function applyDataFilters() {
  const sheetStatistics = getActiveSheetStats();
  const columns = sheetStatistics?.columns || [];
  const filters = getActiveFilters();
  const appliedFilterColumns = getVisibleFilterColumns(sheetStatistics);
  const rows = Array.from(elements.dataTableContainer.querySelectorAll('.data-table tbody tr'));
  let visibleCount = 0;

  rows.forEach((row) => {
    const cells = Array.from(row.children);
    const isVisible = appliedFilterColumns.every((column) => {
      const index = columns.indexOf(column);
      const filterValue = String(filters[column] || '');

      if (!filterValue) {
        return true;
      }

      const cellValue = String(cells[index]?.textContent || '');
      return filterValue === '__BLANK__' ? cellValue === '' : cellValue === filterValue;
    });

    row.classList.toggle('hidden', !isVisible);
    if (isVisible) {
      visibleCount += 1;
    }
  });

  if (elements.dataRowCount && sheetStatistics) {
    elements.dataRowCount.textContent = `Showing ${formatNumber(visibleCount)} of ${formatNumber(sheetStatistics.rows.length)} rows`;
  }
}

function renderDataFilters(sheetStatistics) {
  clearElement(elements.dataFilters);

  const columns = sheetStatistics?.columns || [];
  const rows = sheetStatistics?.rows || [];
  const filters = getActiveFilters();
  const visibleColumns = getVisibleFilterColumns(sheetStatistics);

  visibleColumns.forEach((column, index) => {
    const selectedValue = filters[column] || '';
    const filterControl = document.createElement('div');
    filterControl.className = 'filter-control';

    const select = document.createElement('select');
    select.className = 'filter-select';
    select.dataset.column = column;

    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = `${column}: All`;
    select.append(allOption);

    const options = getColumnFilterOptions(rows, column);

    if (options.hasBlank) {
      const blankOption = document.createElement('option');
      blankOption.value = '__BLANK__';
      blankOption.textContent = `${column}: (Blank)`;
      select.append(blankOption);
    }

    options.values.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = `${column}: ${value}`;
      select.append(option);
    });

    select.value = selectedValue;
    filterControl.append(select);

    if (index > 0) {
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'remove-filter-button';
      removeButton.dataset.column = column;
      removeButton.textContent = 'x';
      removeButton.setAttribute('aria-label', `Remove ${column} filter`);
      filterControl.append(removeButton);
    }

    elements.dataFilters.append(filterControl);
  });

  const remainingColumns = columns.filter((column) => !visibleColumns.includes(column));

  if (remainingColumns.length) {
    const addFilter = document.createElement('select');
    addFilter.className = 'add-filter-select';
    addFilter.value = '';

    const addOption = document.createElement('option');
    addOption.value = '';
    addOption.textContent = '+ Add Filter';
    addFilter.append(addOption);

    remainingColumns.forEach((column) => {
      const option = document.createElement('option');
      option.value = column;
      option.textContent = column;
      addFilter.append(option);
    });

    elements.dataFilters.append(addFilter);
  }
}

function renderDataTable(sheetStatistics) {
  clearElement(elements.dataTableContainer);

  const columns = sheetStatistics?.columns || [];
  const rows = sheetStatistics?.rows || [];

  if (!columns.length) {
    elements.dataTableContainer.append(createTextElement('p', 'muted-text', 'No data found in this sheet.'));
    return;
  }

  const tableWrap = document.createElement('div');
  tableWrap.className = 'data-table-wrap';

  const table = document.createElement('table');
  table.className = 'data-table';

  const columnWidths = getDataColumnWidths(columns, rows);
  table.style.minWidth = `${columnWidths.reduce((total, width) => total + width, 0)}px`;

  const columnGroup = document.createElement('colgroup');
  columnWidths.forEach((width) => {
    const tableColumn = document.createElement('col');
    tableColumn.style.width = `${width}px`;
    columnGroup.append(tableColumn);
  });
  table.append(columnGroup);

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  columns.forEach((column) => {
    const headerCell = document.createElement('th');
    headerCell.textContent = column;
    headerRow.append(headerCell);
  });

  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement('tbody');
  rows.forEach((row) => {
    const tableRow = document.createElement('tr');

    columns.forEach((column) => {
      const cell = document.createElement('td');
      cell.textContent = formatDataValue(row[column]);
      tableRow.append(cell);
    });

    tbody.append(tableRow);
  });

  table.append(tbody);
  tableWrap.append(table);
  elements.dataTableContainer.append(tableWrap);
  applyDataFilters();
}

function destroyCharts() {
  state.chartInstances.forEach((chart) => chart.destroy());
  state.chartInstances = [];
}

function getChartData(sheetStatistics, column) {
  const details = sheetStatistics.columnTypes.details[column];

  if (details.type === 'numeric') {
    const stats = sheetStatistics.numericStats[column];
    return {
      title: column,
      labels: ['Total', 'Average', 'Maximum', 'Minimum'],
      data: [stats?.sum || 0, stats?.average || 0, stats?.max || 0, stats?.min || 0]
    };
  }

  if (details.type === 'date') {
    const entries = Object.entries(sheetStatistics.dateStats[column]?.monthlyCounts || {})
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-8);

    return {
      title: column,
      labels: entries.map(([month]) => month),
      data: entries.map(([, count]) => count)
    };
  }

  const topValues = sheetStatistics.textStats[column]?.topValues || [];
  return {
    title: column,
    labels: topValues.map((item) => (item.value.length > 30 ? `${item.value.slice(0, 27)}...` : item.value)),
    data: topValues.map((item) => item.count)
  };
}

function renderChart(sheetStatistics, column) {
  destroyCharts();

  const chartData = getChartData(sheetStatistics, column);
  elements.barChartTitle.textContent = chartData.title;
  elements.doughnutChartTitle.textContent = `${chartData.title} Share`;

  if (!chartData.labels.length) {
    return;
  }

  const barChart = new Chart(elements.barChartCanvas, {
    type: 'bar',
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: column,
          data: chartData.data,
          backgroundColor: chartColors[0],
          borderColor: chartColors[0],
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      locale: 'en-US',
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          ticks: {
            font: {
              family: 'Tahoma, Arial, sans-serif'
            }
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            font: {
              family: 'Tahoma, Arial, sans-serif'
            }
          }
        }
      }
    }
  });

  const doughnutChart = new Chart(elements.doughnutChartCanvas, {
    type: 'doughnut',
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: column,
          data: chartData.data,
          backgroundColor: chartColors,
          borderColor: '#ffffff',
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      locale: 'en-US',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 12,
            font: {
              family: 'Tahoma, Arial, sans-serif'
            }
          }
        }
      }
    }
  });

  state.chartInstances.push(barChart, doughnutChart);
}

function renderSelectedColumn() {
  const sheetStatistics = getActiveSheetStats();
  clearElement(elements.dataFilters);
  clearElement(elements.dataTableContainer);
  elements.dataRowCount.textContent = '';
  destroyCharts();

  if (!sheetStatistics || !state.selectedColumn) {
    elements.selectedColumnPanel.classList.add('hidden');
    return;
  }

  const column = state.selectedColumn;
  const details = sheetStatistics.columnTypes.details[column];

  if (!details) {
    elements.selectedColumnPanel.classList.add('hidden');
    return;
  }

  elements.selectedColumnTitle.textContent = column;

  renderChart(sheetStatistics, column);
  renderDataFilters(sheetStatistics);
  renderDataTable(sheetStatistics);
  elements.selectedColumnPanel.classList.remove('hidden');
}

function renderActiveSheet() {
  const sheetStatistics = getActiveSheetStats();

  renderFirstSheet();

  if (!sheetStatistics) {
    clearElement(elements.sheetTabs);
    clearElement(elements.columnsList);
    clearElement(elements.dataTableContainer);
    elements.dataSheetTitle.textContent = 'Details';
    elements.selectedColumnPanel.classList.add('hidden');
    return;
  }

  state.activeSheet = sheetStatistics.sheetName;
  elements.dataSheetTitle.textContent = sheetStatistics.sheetName;
  renderSheetTabs();
  renderColumnButtons(sheetStatistics);
  renderSelectedColumn();
}

async function loadDashboard() {
  setMainLoading(true);
  elements.emptyState.classList.add('hidden');
  elements.dashboardContent.classList.add('hidden');

  try {
    const response = await fetch('/api/statistics');

    if (!response.ok) {
      throw new Error('Could not load statistics.');
    }

    state.statistics = await response.json();

    if (!state.statistics.sheets.length) {
      elements.emptyState.classList.remove('hidden');
      return;
    }

    if (!getDetailSheets().some((sheet) => sheet.sheetName === state.activeSheet)) {
      state.activeSheet = getDetailSheets()[0]?.sheetName || '';
    }

    state.selectedColumn = '';
    state.columnFilters = {};
    state.visibleFilterColumns = {};
    renderActiveSheet();
    elements.dashboardContent.classList.remove('hidden');
  } catch (error) {
    setMessage(error.message || 'An error occurred while loading the dashboard.', 'error');
    elements.emptyState.classList.remove('hidden');
  } finally {
    setMainLoading(false);
  }
}

function openUploadModal() {
  elements.uploadModal.classList.remove('hidden');
  elements.uploadStatus.textContent = '';
  elements.uploadStatus.className = 'upload-status';
  elements.excelFile.focus();
}

function closeUploadModal() {
  elements.uploadModal.classList.add('hidden');
  elements.uploadForm.reset();
  elements.uploadButton.disabled = false;
  elements.uploadButton.textContent = 'Upload and Replace';
}

function setUploadStatus(text, type) {
  elements.uploadStatus.textContent = text;
  elements.uploadStatus.className = `upload-status ${type || ''}`;
}

async function handleUpload(event) {
  event.preventDefault();

  const file = elements.excelFile.files[0];
  if (!file) {
    setUploadStatus('Please choose an Excel file.', 'error');
    return;
  }

  const extension = file.name.split('.').pop().toLowerCase();
  if (!['xlsx', 'xls'].includes(extension)) {
    setUploadStatus('This file extension is not allowed.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('excelFile', file);

  elements.uploadButton.disabled = true;
  elements.uploadButton.textContent = 'Uploading...';
  setUploadStatus('Uploading and analyzing...', '');

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message || 'Could not upload the file.');
    }

    setUploadStatus(payload.message, 'success');
    setMessage('Data updated successfully.', 'success');
    state.activeSheet = '';
    state.selectedColumn = '';
    state.columnFilters = {};
    state.visibleFilterColumns = {};
    await loadDashboard();
    closeUploadModal();
  } catch (error) {
    setUploadStatus(error.message || 'An error occurred while uploading the file.', 'error');
  } finally {
    elements.uploadButton.disabled = false;
    elements.uploadButton.textContent = 'Upload and Replace';
  }
}

function bindEvents() {
  elements.openUploadModal.addEventListener('click', openUploadModal);
  elements.uploadForm.addEventListener('submit', handleUpload);

  document.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', closeUploadModal);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !elements.uploadModal.classList.contains('hidden')) {
      closeUploadModal();
    }
  });

  elements.sheetTabs.addEventListener('click', (event) => {
    const button = event.target.closest('.sheet-tab');
    if (!button || button.dataset.sheet === state.activeSheet) {
      return;
    }

    state.activeSheet = button.dataset.sheet;
    state.selectedColumn = '';
    getActiveFilters();
    renderActiveSheet();
  });

  elements.columnsList.addEventListener('click', (event) => {
    const button = event.target.closest('.column-button');
    if (!button) {
      return;
    }

    state.selectedColumn = button.dataset.column;
    setVisibleFilterColumns([state.selectedColumn]);
    renderColumnButtons(getActiveSheetStats());
    renderSelectedColumn();
  });

  elements.dataFilters.addEventListener('change', (event) => {
    const select = event.target.closest('.filter-select');
    if (!select) {
      return;
    }

    const sheetStatistics = getActiveSheetStats();
    const filters = getActiveFilters();
    filters[select.dataset.column] = select.value;
    renderDataFilters(sheetStatistics);
    applyDataFilters();
  });

  elements.dataFilters.addEventListener('change', (event) => {
    const select = event.target.closest('.add-filter-select');
    if (!select || !select.value) {
      return;
    }

    const sheetStatistics = getActiveSheetStats();
    setVisibleFilterColumns([...getVisibleFilterColumns(sheetStatistics), select.value]);
    renderDataFilters(sheetStatistics);
    applyDataFilters();
  });

  elements.dataFilters.addEventListener('click', (event) => {
    const button = event.target.closest('.remove-filter-button');
    if (!button) {
      return;
    }

    const sheetStatistics = getActiveSheetStats();
    const filters = getActiveFilters();
    delete filters[button.dataset.column];
    setVisibleFilterColumns(getVisibleFilterColumns(sheetStatistics).filter((column) => column !== button.dataset.column));
    renderDataFilters(sheetStatistics);
    applyDataFilters();
  });

  elements.clearDataFilters.addEventListener('click', () => {
    state.columnFilters[state.activeSheet] = {};
    setVisibleFilterColumns(state.selectedColumn ? [state.selectedColumn] : []);
    renderDataFilters(getActiveSheetStats());
    applyDataFilters();
  });
}

bindEvents();
loadDashboard();
