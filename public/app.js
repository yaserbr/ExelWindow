const state = {
  statistics: null,
  activeSheet: '',
  selectedColumn: '',
  selectedFilterValues: new Set(),
  filterSearch: '',
  chartInstances: []
};

const elements = {
  messageBox: document.getElementById('messageBox'),
  loadingState: document.getElementById('loadingState'),
  emptyState: document.getElementById('emptyState'),
  dashboardContent: document.getElementById('dashboardContent'),
  executiveSummaryPanel: document.getElementById('executiveSummaryPanel'),
  executiveSummaryTables: document.getElementById('executiveSummaryTables'),
  sheetTabs: document.getElementById('sheetTabs'),
  columnsList: document.getElementById('columnsList'),
  selectedColumnPanel: document.getElementById('selectedColumnPanel'),
  selectedColumnTitle: document.getElementById('selectedColumnTitle'),
  selectedColumnMeta: document.getElementById('selectedColumnMeta'),
  columnFilterPanel: document.getElementById('columnFilterPanel'),
  filterSummary: document.getElementById('filterSummary'),
  selectAllFilters: document.getElementById('selectAllFilters'),
  clearFilters: document.getElementById('clearFilters'),
  filterSearch: document.getElementById('filterSearch'),
  filterOptions: document.getElementById('filterOptions'),
  selectedColumnStats: document.getElementById('selectedColumnStats'),
  chartsPanel: document.getElementById('chartsPanel'),
  chartTitle: document.getElementById('chartTitle'),
  chartsGrid: document.getElementById('chartsGrid'),
  openUploadModal: document.getElementById('openUploadModal'),
  uploadModal: document.getElementById('uploadModal'),
  uploadForm: document.getElementById('uploadForm'),
  excelFile: document.getElementById('excelFile'),
  uploadStatus: document.getElementById('uploadStatus'),
  uploadButton: document.getElementById('uploadButton')
};

const chartColors = [
  '#1264d8',
  '#10a37f',
  '#b7791f',
  '#7c3aed',
  '#dc2626',
  '#0891b2',
  '#4f46e5',
  '#65a30d'
];

function formatNumber(value) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2
  }).format(value);
}

function formatDateTime(value) {
  if (!value) {
    return 'No data yet';
  }

  const dateValue = new Date(value);

  if (Number.isNaN(dateValue.getTime())) {
    return 'Unknown date';
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

function setMessage(text, type = 'success') {
  elements.messageBox.textContent = text;
  elements.messageBox.className = `message-box active ${type}`;

  window.setTimeout(() => {
    elements.messageBox.textContent = '';
    elements.messageBox.className = 'message-box';
  }, 5000);
}

function setMainLoading(isLoading) {
  elements.loadingState.classList.toggle('hidden', !isLoading);
}

function getExecutiveSheet() {
  return state.statistics?.sheets?.find((sheet) => sheet.role === 'summary') || state.statistics?.sheets?.[0] || null;
}

function getDetailSheets() {
  return (state.statistics?.sheets || []).filter((sheet) => sheet.role !== 'summary');
}

function getActiveSheetStats() {
  const detailSheets = getDetailSheets();

  if (!detailSheets.length) {
    return null;
  }

  return (
    detailSheets.find((sheet) => sheet.sheetName === state.activeSheet) ||
    detailSheets.find((sheet) => sheet.fileInfo.rowCount > 0) ||
    detailSheets[0]
  );
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

  return tables;
}

function compactTableRows(rows) {
  const maxColumns = rows.reduce((max, row) => {
    let lastCellIndex = row.length - 1;

    while (lastCellIndex >= 0 && String(row[lastCellIndex] || '').trim() === '') {
      lastCellIndex -= 1;
    }

    return Math.max(max, lastCellIndex + 1);
  }, 0);

  const usedColumnIndexes = [];

  for (let index = 0; index < maxColumns; index += 1) {
    const hasData = rows.some((row) => String(row[index] || '').trim() !== '');

    if (hasData) {
      usedColumnIndexes.push(index);
    }
  }

  return rows.map((row) => usedColumnIndexes.map((index) => row[index] || ''));
}

function renderExecutiveSummary() {
  const executiveSheet = getExecutiveSheet();
  clearElement(elements.executiveSummaryTables);

  if (!executiveSheet || !executiveSheet.rawRows?.length) {
    elements.executiveSummaryPanel.classList.add('hidden');
    return;
  }

  const tables = splitIntoTables(executiveSheet.rawRows);

  tables.forEach((sourceRows, tableIndex) => {
    const rows = compactTableRows(sourceRows);
    const firstRowValues = rows[0]?.filter((cell) => String(cell || '').trim() !== '') || [];
    const hasStandaloneTitle = firstRowValues.length === 1 && rows.length > 1;
    const tableRows = hasStandaloneTitle ? rows.slice(1) : rows;
    const tableCard = document.createElement('article');
    tableCard.className = 'mini-table-card';

    if (hasStandaloneTitle) {
      tableCard.append(createTextElement('h3', '', firstRowValues[0]));
    }

    const table = document.createElement('table');
    table.className = 'mini-table';

    tableRows.forEach((row, rowIndex) => {
      const tableRow = document.createElement('tr');
      const hasManyCells = row.filter((cell) => String(cell || '').trim() !== '').length > 1;

      row.forEach((cell) => {
        const cellElement = document.createElement(rowIndex === 0 && hasManyCells ? 'th' : 'td');
        cellElement.textContent = String(cell || '');
        tableRow.append(cellElement);
      });

      table.append(tableRow);
    });

    tableCard.append(table);
    elements.executiveSummaryTables.append(tableCard);
  });

  elements.executiveSummaryPanel.classList.remove('hidden');
}

function renderSheetTabs(workbookStatistics) {
  clearElement(elements.sheetTabs);

  const detailSheets = workbookStatistics.fileInfo.sheets.filter((sheet) => sheet.role !== 'summary');

  if (!detailSheets.length) {
    elements.sheetTabs.append(createTextElement('p', 'muted-text', 'No detail sheets found.'));
    return;
  }

  detailSheets.forEach((sheet) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `sheet-tab${sheet.name === state.activeSheet ? ' active' : ''}`;
    button.dataset.sheet = sheet.name;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', sheet.name === state.activeSheet ? 'true' : 'false');

    const title = createTextElement('span', 'sheet-tab-title', sheet.name);
    const meta = createTextElement(
      'span',
      'sheet-tab-meta',
      `${formatNumber(sheet.rowCount)} rows - ${formatNumber(sheet.columnCount)} columns`
    );

    button.append(title, meta);
    elements.sheetTabs.append(button);
  });
}

function renderColumnButtons(statistics) {
  clearElement(elements.columnsList);

  if (!statistics.columnTypes.all.length) {
    elements.columnsList.append(createTextElement('p', 'muted-text', 'This sheet has no columns.'));
    return;
  }

  statistics.columnTypes.all.forEach((column) => {
    const button = document.createElement('button');
    const details = statistics.columnTypes.details[column];

    button.type = 'button';
    button.className = `column-button${state.selectedColumn === column ? ' active' : ''}`;
    button.dataset.column = column;
    button.append(createTextElement('span', 'column-name', column));
    button.append(createTextElement('span', 'column-meta', `${details.type} - ${formatNumber(details.emptyCount)} blank`));
    elements.columnsList.append(button);
  });
}

function getSelectedFilterValuesArray() {
  return [...state.selectedFilterValues];
}

function getFilterOptions(sheetStatistics, column) {
  return sheetStatistics.filterOptions?.[column] || [];
}

function renderFilterOptions(sheetStatistics, column) {
  const options = getFilterOptions(sheetStatistics, column);
  const normalizedSearch = state.filterSearch.trim().toLowerCase();
  const visibleOptions = normalizedSearch
    ? options.filter((item) => item.value.toLowerCase().includes(normalizedSearch))
    : options;

  clearElement(elements.filterOptions);
  elements.columnFilterPanel.classList.toggle('hidden', options.length === 0);

  if (!options.length) {
    return;
  }

  const selectedCount = state.selectedFilterValues.size;
  elements.filterSummary.textContent = selectedCount
    ? `${formatNumber(selectedCount)} selected. Filtering is active.`
    : `No filter selected. Showing all ${formatNumber(options.length)} values.`;

  visibleOptions.forEach((item) => {
    const label = document.createElement('label');
    label.className = 'filter-option';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = item.value;
    checkbox.checked = state.selectedFilterValues.has(item.value);

    const valueText = createTextElement('span', 'filter-value', item.value);
    const countText = createTextElement('span', 'filter-count', formatNumber(item.count));

    label.append(checkbox, valueText, countText);
    elements.filterOptions.append(label);
  });
}

function createMetric(label, value) {
  const item = document.createElement('div');
  item.append(createTextElement('span', '', label));
  item.append(createTextElement('strong', '', value));
  return item;
}

function renderNumericColumn(column, stats) {
  const card = document.createElement('article');
  card.className = 'stat-card full-stat-card';
  card.append(createTextElement('h3', '', column));

  const list = document.createElement('div');
  list.className = 'stat-list';
  list.append(createMetric('Total', formatNumber(stats.sum)));
  list.append(createMetric('Average', formatNumber(stats.average)));
  list.append(createMetric('Maximum', formatNumber(stats.max)));
  list.append(createMetric('Minimum', formatNumber(stats.min)));
  list.append(createMetric('Numeric values', formatNumber(stats.count)));

  card.append(list);
  elements.selectedColumnStats.append(card);
}

function renderTextColumn(column, stats) {
  const card = document.createElement('article');
  card.className = 'stat-card full-stat-card';
  card.append(createTextElement('h3', '', column));
  card.append(createTextElement('p', 'muted-text', `Unique values: ${formatNumber(stats.uniqueCount)}`));

  const list = document.createElement('div');
  list.className = 'top-values';

  if (!stats.topValues.length) {
    list.append(createTextElement('p', 'muted-text', 'No text values found.'));
  } else {
    stats.topValues.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'value-row';
      row.append(createTextElement('strong', '', item.value));
      row.append(createTextElement('span', '', formatNumber(item.count)));
      list.append(row);
    });
  }

  card.append(list);
  elements.selectedColumnStats.append(card);
}

function renderDateColumn(column, stats) {
  const card = document.createElement('article');
  card.className = 'stat-card full-stat-card';
  card.append(createTextElement('h3', '', column));

  const list = document.createElement('div');
  list.className = 'stat-list';
  list.append(createMetric('Oldest date', formatDateTime(stats.oldest)));
  list.append(createMetric('Latest date', formatDateTime(stats.latest)));
  list.append(createMetric('Date records', formatNumber(stats.count)));
  list.append(createMetric('Months', formatNumber(Object.keys(stats.monthlyCounts || {}).length)));

  card.append(list);
  elements.selectedColumnStats.append(card);
}

function destroyCharts() {
  state.chartInstances.forEach((chart) => chart.destroy());
  state.chartInstances = [];
}

function getDatasetStyle(chartType, index = 0) {
  if (chartType === 'doughnut' || chartType === 'pie') {
    return {
      backgroundColor: chartColors,
      borderColor: '#ffffff',
      borderWidth: 2
    };
  }

  return {
    backgroundColor: chartColors[index % chartColors.length],
    borderColor: chartColors[index % chartColors.length],
    borderWidth: 1
  };
}

function buildColumnCharts(sheetStatistics, column) {
  const type = sheetStatistics.columnTypes.details[column]?.type;

  if (type === 'text') {
    const stats = sheetStatistics.textStats[column];
    if (!stats?.topValues?.length) {
      return [];
    }

    const labels = stats.topValues.map((item) => item.value.length > 48 ? `${item.value.slice(0, 45)}...` : item.value);
    const data = stats.topValues.map((item) => item.count);
    const total = data.reduce((sum, value) => sum + value, 0);
    let runningTotal = 0;
    const cumulativePercent = data.map((value) => {
      runningTotal += value;
      return total ? Math.round((runningTotal / total) * 1000) / 10 : 0;
    });

    return [
      {
        type: 'bar',
        title: `${column} Top Values`,
        labels,
        data,
        label: column
      },
      {
        type: 'doughnut',
        title: `${column} Share`,
        labels,
        data,
        label: column
      },
      {
        type: 'line',
        title: `${column} Cumulative Share`,
        labels,
        data: cumulativePercent,
        label: column,
        percentChart: true
      }
    ];
  }

  if (type === 'numeric') {
    const stats = sheetStatistics.numericStats[column];
    if (!stats || stats.count === 0) {
      return [];
    }

    const labels = ['Total', 'Average', 'Maximum', 'Minimum'];
    const data = [stats.sum || 0, stats.average || 0, stats.max || 0, stats.min || 0];

    return [
      {
        type: 'bar',
        title: `${column} Metrics`,
        labels,
        data,
        label: column
      },
      {
        type: 'doughnut',
        title: `${column} Metrics Share`,
        labels,
        data,
        label: column
      },
      {
        type: 'radar',
        title: `${column} Metrics Radar`,
        labels,
        data,
        label: column
      }
    ];
  }

  if (type === 'date') {
    const stats = sheetStatistics.dateStats[column];
    const entries = Object.entries(stats?.monthlyCounts || {}).sort((a, b) => a[0].localeCompare(b[0]));

    if (!entries.length) {
      return [];
    }

    const labels = entries.map(([month]) => month);
    const data = entries.map(([, count]) => count);

    return [
      {
        type: 'bar',
        title: `${column} by Month`,
        labels,
        data,
        label: column
      },
      {
        type: 'line',
        title: `${column} Monthly Trend`,
        labels,
        data,
        label: column
      },
      {
        type: 'doughnut',
        title: `${column} Monthly Share`,
        labels,
        data,
        label: column
      }
    ];
  }

  return [];
}

function renderColumnChart(sheetStatistics, column) {
  destroyCharts();
  clearElement(elements.chartsGrid);

  const chartDefinitions = buildColumnCharts(sheetStatistics, column);

  if (!chartDefinitions.length) {
    elements.chartsPanel.classList.add('hidden');
    return;
  }

  elements.chartTitle.textContent = `${column} Charts`;
  elements.chartsPanel.classList.remove('hidden');

  chartDefinitions.forEach((chartDefinition, index) => {
    const card = document.createElement('article');
    card.className = 'chart-card';
    card.append(createTextElement('h3', '', chartDefinition.title));

    const canvas = document.createElement('canvas');
    card.append(canvas);
    elements.chartsGrid.append(card);

    const chart = new Chart(canvas, {
      type: chartDefinition.type,
      data: {
        labels: chartDefinition.labels,
        datasets: [
          {
            label: chartDefinition.percentChart ? 'Cumulative %' : chartDefinition.label,
            data: chartDefinition.data,
            ...getDatasetStyle(chartDefinition.type, index),
            ...(chartDefinition.percentChart
              ? {
                  borderColor: '#10a37f',
                  backgroundColor: 'rgba(16, 163, 127, 0.12)',
                  borderWidth: 3,
                  tension: 0.35,
                  fill: true
                }
              : {})
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        locale: 'en-US',
        indexAxis: chartDefinition.indexAxis || 'x',
        plugins: {
          legend: {
            position: 'bottom'
          }
        },
        scales: chartDefinition.percentChart
          ? {
              x: { ticks: { font: { family: 'Tahoma, Arial, sans-serif' } } },
              y: {
                beginAtZero: true,
                max: 100,
                ticks: {
                  callback: (value) => `${value}%`,
                  font: { family: 'Tahoma, Arial, sans-serif' }
                }
              }
            }
          : chartDefinition.type === 'doughnut' || chartDefinition.type === 'pie' || chartDefinition.type === 'radar'
          ? {}
          : {
              x: { ticks: { font: { family: 'Tahoma, Arial, sans-serif' } } },
              y: { beginAtZero: true, ticks: { font: { family: 'Tahoma, Arial, sans-serif' } } }
            }
      }
    });

    state.chartInstances.push(chart);
  });
}

async function fetchFilteredColumnStatistics(sheetStatistics, column) {
  const selectedValues = getSelectedFilterValuesArray();

  if (!selectedValues.length) {
    return sheetStatistics;
  }

  const response = await fetch('/api/column-statistics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sheet: sheetStatistics.sheetName,
      column,
      values: selectedValues
    })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.message || 'Could not apply the filter.');
  }

  return payload.statistics;
}

async function renderSelectedColumn() {
  const sheetStatistics = getActiveSheetStats();
  clearElement(elements.selectedColumnStats);
  destroyCharts();
  clearElement(elements.chartsGrid);
  elements.chartsPanel.classList.add('hidden');

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
  renderFilterOptions(sheetStatistics, column);

  const filteredStatistics = await fetchFilteredColumnStatistics(sheetStatistics, column);
  const filteredDetails = filteredStatistics.columnTypes.details[column] || details;
  const selectedFilterCount = state.selectedFilterValues.size;

  elements.selectedColumnMeta.textContent =
    `Type: ${filteredDetails.type}. Rows: ${formatNumber(filteredStatistics.fileInfo.rowCount)}. ` +
    `Non-empty: ${formatNumber(filteredDetails.nonEmptyCount)}. Blank: ${formatNumber(filteredDetails.emptyCount)}.` +
    (selectedFilterCount ? ` Filtered by ${formatNumber(selectedFilterCount)} value(s).` : '');

  if (filteredDetails.type === 'numeric') {
    renderNumericColumn(column, filteredStatistics.numericStats[column]);
  } else if (filteredDetails.type === 'date') {
    renderDateColumn(column, filteredStatistics.dateStats[column]);
  } else {
    renderTextColumn(column, filteredStatistics.textStats[column]);
  }

  renderColumnChart(filteredStatistics, column);
  elements.selectedColumnPanel.classList.remove('hidden');
}

async function renderActiveSheet() {
  const sheetStatistics = getActiveSheetStats();

  renderExecutiveSummary();

  if (!sheetStatistics) {
    clearElement(elements.sheetTabs);
  clearElement(elements.columnsList);
  elements.selectedColumnPanel.classList.add('hidden');
    elements.columnFilterPanel.classList.add('hidden');
  elements.chartsPanel.classList.add('hidden');
    return;
  }

  state.activeSheet = sheetStatistics.sheetName;
  renderSheetTabs(state.statistics);
  renderColumnButtons(sheetStatistics);
  await renderSelectedColumn();
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

    const statistics = await response.json();
    state.statistics = statistics;

    if (!statistics.fileInfo.sheetCount || !statistics.sheets.length) {
      elements.emptyState.classList.remove('hidden');
      return;
    }

    if (!getDetailSheets().some((sheet) => sheet.sheetName === state.activeSheet)) {
    state.activeSheet =
        getDetailSheets().find((sheet) => sheet.fileInfo.rowCount > 0)?.sheetName || getDetailSheets()[0]?.sheetName || '';
    }

    state.selectedColumn = '';
    state.selectedFilterValues = new Set();
    state.filterSearch = '';
    await renderActiveSheet();
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
  setUploadStatus('Uploading and analyzing all sheets...', '');

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
    setMessage(
      `${payload.message} ${formatNumber(payload.sheetCount)} sheets and ${formatNumber(payload.rowCount)} rows loaded.`,
      'success'
    );
    state.activeSheet = '';
    state.selectedColumn = '';
    state.selectedFilterValues = new Set();
    state.filterSearch = '';
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

  elements.sheetTabs.addEventListener('click', async (event) => {
    const button = event.target.closest('.sheet-tab');
    if (!button || button.dataset.sheet === state.activeSheet) {
      return;
    }

    state.activeSheet = button.dataset.sheet;
    state.selectedColumn = '';
    state.selectedFilterValues = new Set();
    state.filterSearch = '';

    try {
      await renderActiveSheet();
    } catch (error) {
      setMessage(error.message, 'error');
    }
  });

  elements.columnsList.addEventListener('click', (event) => {
    const button = event.target.closest('.column-button');
    if (!button) {
      return;
    }

    state.selectedColumn = button.dataset.column;
    state.selectedFilterValues = new Set();
    state.filterSearch = '';
    elements.filterSearch.value = '';
    const sheetStatistics = getActiveSheetStats();
    renderColumnButtons(sheetStatistics);
    renderSelectedColumn().catch((error) => setMessage(error.message, 'error'));
  });

  elements.filterOptions.addEventListener('change', (event) => {
    const checkbox = event.target.closest('input[type="checkbox"]');
    if (!checkbox) {
      return;
    }

    if (checkbox.checked) {
      state.selectedFilterValues.add(checkbox.value);
    } else {
      state.selectedFilterValues.delete(checkbox.value);
    }

    renderSelectedColumn().catch((error) => setMessage(error.message, 'error'));
  });

  elements.filterSearch.addEventListener('input', (event) => {
    state.filterSearch = event.target.value;
    const sheetStatistics = getActiveSheetStats();
    renderFilterOptions(sheetStatistics, state.selectedColumn);
  });

  elements.selectAllFilters.addEventListener('click', () => {
    const sheetStatistics = getActiveSheetStats();
    const options = getFilterOptions(sheetStatistics, state.selectedColumn);
    const normalizedSearch = state.filterSearch.trim().toLowerCase();
    const valuesToSelect = normalizedSearch
      ? options.filter((item) => item.value.toLowerCase().includes(normalizedSearch)).map((item) => item.value)
      : options.map((item) => item.value);

    valuesToSelect.forEach((value) => state.selectedFilterValues.add(value));
    renderSelectedColumn().catch((error) => setMessage(error.message, 'error'));
  });

  elements.clearFilters.addEventListener('click', () => {
    state.selectedFilterValues = new Set();
    renderSelectedColumn().catch((error) => setMessage(error.message, 'error'));
  });
}

bindEvents();
loadDashboard();
