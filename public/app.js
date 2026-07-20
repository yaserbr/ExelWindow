const state = {
  statistics: null,
  activeSheet: '',
  columns: [],
  page: 1,
  limit: 20,
  search: '',
  sortBy: '',
  sortDir: 'asc',
  chartInstances: []
};

const elements = {
  lastUpdate: document.getElementById('lastUpdate'),
  messageBox: document.getElementById('messageBox'),
  loadingState: document.getElementById('loadingState'),
  emptyState: document.getElementById('emptyState'),
  dashboardContent: document.getElementById('dashboardContent'),
  summaryCards: document.getElementById('summaryCards'),
  sheetTabs: document.getElementById('sheetTabs'),
  activeSheetMeta: document.getElementById('activeSheetMeta'),
  columnsList: document.getElementById('columnsList'),
  blankValues: document.getElementById('blankValues'),
  numericStats: document.getElementById('numericStats'),
  textStats: document.getElementById('textStats'),
  dateStatsPanel: document.getElementById('dateStatsPanel'),
  dateStats: document.getElementById('dateStats'),
  chartsPanel: document.getElementById('chartsPanel'),
  chartsGrid: document.getElementById('chartsGrid'),
  tableCount: document.getElementById('tableCount'),
  tableSearch: document.getElementById('tableSearch'),
  tableHead: document.getElementById('tableHead'),
  tableBody: document.getElementById('tableBody'),
  pageInfo: document.getElementById('pageInfo'),
  prevPage: document.getElementById('prevPage'),
  nextPage: document.getElementById('nextPage'),
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

function formatCell(value) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  return String(value);
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

function getActiveSheetStats() {
  if (!state.statistics?.sheets?.length) {
    return null;
  }

  return (
    state.statistics.sheets.find((sheet) => sheet.sheetName === state.activeSheet) ||
    state.statistics.sheets.find((sheet) => sheet.fileInfo.rowCount > 0) ||
    state.statistics.sheets[0]
  );
}

function renderSummary(workbookStatistics, sheetStatistics) {
  const cards = [
    ['Sheets', workbookStatistics.fileInfo.sheetCount],
    ['Total rows', workbookStatistics.fileInfo.totalRows],
    ['Current sheet rows', sheetStatistics.fileInfo.rowCount],
    ['Current sheet columns', sheetStatistics.fileInfo.columnCount],
    ['Numeric columns', sheetStatistics.columnTypes.numeric.length],
    ['Text columns', sheetStatistics.columnTypes.text.length]
  ];

  clearElement(elements.summaryCards);

  cards.forEach(([label, value]) => {
    const card = document.createElement('article');
    card.className = 'summary-card';
    card.append(createTextElement('span', '', label));
    card.append(createTextElement('strong', '', formatNumber(value)));
    elements.summaryCards.append(card);
  });
}

function renderSheetTabs(workbookStatistics) {
  clearElement(elements.sheetTabs);

  workbookStatistics.fileInfo.sheets.forEach((sheet) => {
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

function renderActiveSheetMeta(sheetStatistics) {
  const headerText = sheetStatistics.headerRowNumber
    ? `Excel header row: ${formatNumber(sheetStatistics.headerRowNumber)}`
    : 'No clear header row found';

  elements.activeSheetMeta.textContent =
    `${sheetStatistics.sheetName} - ${formatNumber(sheetStatistics.fileInfo.rowCount)} rows, ` +
    `${formatNumber(sheetStatistics.fileInfo.columnCount)} columns. ${headerText}`;
}

function renderColumns(statistics) {
  clearElement(elements.columnsList);
  clearElement(elements.blankValues);

  if (!statistics.columnTypes.all.length) {
    elements.columnsList.append(createTextElement('p', 'muted-text', 'This sheet has no columns.'));
    return;
  }

  statistics.columnTypes.all.forEach((column) => {
    elements.columnsList.append(createTextElement('span', 'column-chip', column));
  });

  Object.entries(statistics.columnTypes.details).forEach(([column, details]) => {
    const chip = createTextElement('span', 'blank-chip', `${column}: ${formatNumber(details.emptyCount)} blank values`);
    elements.blankValues.append(chip);
  });
}

function renderNumericStats(numericStats) {
  clearElement(elements.numericStats);

  const entries = Object.entries(numericStats);

  if (entries.length === 0) {
    elements.numericStats.append(createTextElement('p', 'muted-text', 'This sheet has no numeric columns.'));
    return;
  }

  entries.forEach(([column, stats]) => {
    const card = document.createElement('article');
    card.className = 'stat-card';
    card.append(createTextElement('h3', '', column));

    const list = document.createElement('div');
    list.className = 'stat-list';

    [
      ['Total', stats.sum],
      ['Average', stats.average],
      ['Maximum', stats.max],
      ['Minimum', stats.min],
      ['Numeric values', stats.count]
    ].forEach(([label, value]) => {
      const item = document.createElement('div');
      item.append(createTextElement('span', '', label));
      item.append(createTextElement('strong', '', formatNumber(value)));
      list.append(item);
    });

    card.append(list);
    elements.numericStats.append(card);
  });
}

function renderTextStats(textStats) {
  clearElement(elements.textStats);

  const entries = Object.entries(textStats);

  if (entries.length === 0) {
    elements.textStats.append(createTextElement('p', 'muted-text', 'This sheet has no text columns.'));
    return;
  }

  entries.forEach(([column, stats]) => {
    const card = document.createElement('article');
    card.className = 'stat-card';
    card.append(createTextElement('h3', '', column));

    const list = document.createElement('div');
    list.className = 'top-values';
    list.append(createTextElement('span', '', `Unique values: ${formatNumber(stats.uniqueCount)}`));

    if (stats.topValues.length === 0) {
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
    elements.textStats.append(card);
  });
}

function renderDateStats(dateStats) {
  clearElement(elements.dateStats);

  const entries = Object.entries(dateStats);
  elements.dateStatsPanel.classList.toggle('hidden', entries.length === 0);

  entries.forEach(([column, stats]) => {
    const card = document.createElement('article');
    card.className = 'stat-card';
    card.append(createTextElement('h3', '', column));

    const list = document.createElement('div');
    list.className = 'stat-list';

    [
      ['Oldest date', formatDateTime(stats.oldest)],
      ['Latest date', formatDateTime(stats.latest)],
      ['Date records', formatNumber(stats.count)],
      ['Months', formatNumber(Object.keys(stats.monthlyCounts || {}).length)]
    ].forEach(([label, value]) => {
      const item = document.createElement('div');
      item.append(createTextElement('span', '', label));
      item.append(createTextElement('strong', '', value));
      list.append(item);
    });

    card.append(list);
    elements.dateStats.append(card);
  });
}

function destroyCharts() {
  state.chartInstances.forEach((chart) => chart.destroy());
  state.chartInstances = [];
}

function getDatasetStyle(chartType, index) {
  if (chartType === 'line') {
    return {
      borderColor: chartColors[index % chartColors.length],
      backgroundColor: 'rgba(18, 100, 216, 0.12)',
      borderWidth: 3,
      tension: 0.35,
      fill: true
    };
  }

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

function renderCharts(charts) {
  destroyCharts();
  clearElement(elements.chartsGrid);

  elements.chartsPanel.classList.toggle('hidden', charts.length === 0);

  charts.forEach((chartDefinition, chartIndex) => {
    const card = document.createElement('article');
    card.className = 'chart-card';
    card.append(createTextElement('h3', '', chartDefinition.title));

    const canvas = document.createElement('canvas');
    card.append(canvas);
    elements.chartsGrid.append(card);

    const styledDatasets = chartDefinition.datasets.map((dataset, datasetIndex) => ({
      ...dataset,
      ...getDatasetStyle(chartDefinition.type, chartIndex + datasetIndex)
    }));

    const chart = new Chart(canvas, {
      type: chartDefinition.type,
      data: {
        labels: chartDefinition.labels,
        datasets: styledDatasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        locale: 'en-US',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              font: {
                family: 'Tahoma, Arial, sans-serif'
              }
            }
          }
        },
        scales: chartDefinition.type === 'doughnut' || chartDefinition.type === 'pie'
          ? {}
          : {
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

    state.chartInstances.push(chart);
  });
}

function renderTableHeader(columns) {
  clearElement(elements.tableHead);

  const row = document.createElement('tr');

  columns.forEach((column) => {
    const th = document.createElement('th');
    const button = document.createElement('button');
    const mark = document.createElement('span');

    button.type = 'button';
    button.className = 'sort-button';
    button.dataset.column = column;
    button.append(createTextElement('span', '', column));

    mark.className = 'sort-mark';
    mark.textContent = state.sortBy === column ? (state.sortDir === 'asc' ? '▲' : '▼') : '';
    button.append(mark);

    th.append(button);
    row.append(th);
  });

  elements.tableHead.append(row);
}

function renderTableRows(rows, columns) {
  clearElement(elements.tableBody);

  if (rows.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = Math.max(columns.length, 1);
    cell.textContent = 'No matching rows found in this sheet.';
    row.append(cell);
    elements.tableBody.append(row);
    return;
  }

  rows.forEach((dataRow) => {
    const row = document.createElement('tr');

    columns.forEach((column) => {
      const cell = document.createElement('td');
      cell.textContent = formatCell(dataRow[column]);
      row.append(cell);
    });

    elements.tableBody.append(row);
  });
}

function renderPagination(pagination) {
  elements.pageInfo.textContent = `Page ${formatNumber(pagination.page)} of ${formatNumber(pagination.totalPages)}`;
  elements.prevPage.disabled = pagination.page <= 1;
  elements.nextPage.disabled = pagination.page >= pagination.totalPages;
  elements.tableCount.textContent = `${formatNumber(pagination.totalRows)} matching rows`;
}

async function loadTable(page = state.page) {
  const params = new URLSearchParams({
    sheet: state.activeSheet,
    page: String(page),
    limit: String(state.limit),
    search: state.search,
    sortBy: state.sortBy,
    sortDir: state.sortDir
  });

  const response = await fetch(`/api/data?${params.toString()}`);

  if (!response.ok) {
    throw new Error('Could not load table data.');
  }

  const payload = await response.json();
  state.page = payload.pagination.page;
  state.columns = payload.columns;

  renderTableHeader(payload.columns);
  renderTableRows(payload.rows, payload.columns);
  renderPagination(payload.pagination);
}

async function renderActiveSheet() {
  const sheetStatistics = getActiveSheetStats();

  if (!sheetStatistics) {
    elements.emptyState.classList.remove('hidden');
    elements.dashboardContent.classList.add('hidden');
    return;
  }

  state.activeSheet = sheetStatistics.sheetName;
  renderSummary(state.statistics, sheetStatistics);
  renderSheetTabs(state.statistics);
  renderActiveSheetMeta(sheetStatistics);
  renderColumns(sheetStatistics);
  renderNumericStats(sheetStatistics.numericStats);
  renderTextStats(sheetStatistics.textStats);
  renderDateStats(sheetStatistics.dateStats);
  renderCharts(sheetStatistics.chartData);
  await loadTable(1);
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
    elements.lastUpdate.textContent = `Last update: ${formatDateTime(statistics.updatedAt)}`;

    if (!statistics.fileInfo.sheetCount || !statistics.sheets.length) {
      elements.emptyState.classList.remove('hidden');
      return;
    }

    if (!statistics.sheets.some((sheet) => sheet.sheetName === state.activeSheet)) {
      state.activeSheet =
        statistics.sheets.find((sheet) => sheet.fileInfo.rowCount > 0)?.sheetName || statistics.sheets[0].sheetName;
    }

    await renderActiveSheet();
    elements.dashboardContent.classList.remove('hidden');
  } catch (error) {
    setMessage(error.message || 'An error occurred while loading the dashboard.', 'error');
    elements.emptyState.classList.remove('hidden');
  } finally {
    setMainLoading(false);
  }
}

function resetTableState() {
  state.page = 1;
  state.search = '';
  state.sortBy = '';
  state.sortDir = 'asc';
  elements.tableSearch.value = '';
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
    resetTableState();
    await loadDashboard();
    closeUploadModal();
  } catch (error) {
    setUploadStatus(error.message || 'An error occurred while uploading the file.', 'error');
  } finally {
    elements.uploadButton.disabled = false;
    elements.uploadButton.textContent = 'Upload and Replace';
  }
}

function debounce(fn, delay) {
  let timerId;

  return (...args) => {
    window.clearTimeout(timerId);
    timerId = window.setTimeout(() => fn(...args), delay);
  };
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
    resetTableState();

    try {
      await renderActiveSheet();
    } catch (error) {
      setMessage(error.message, 'error');
    }
  });

  elements.tableSearch.addEventListener('input', debounce(async (event) => {
    state.search = event.target.value.trim();
    state.page = 1;
    try {
      await loadTable(1);
    } catch (error) {
      setMessage(error.message, 'error');
    }
  }, 350));

  elements.tableHead.addEventListener('click', async (event) => {
    const button = event.target.closest('.sort-button');
    if (!button) {
      return;
    }

    const column = button.dataset.column;
    state.sortDir = state.sortBy === column && state.sortDir === 'asc' ? 'desc' : 'asc';
    state.sortBy = column;

    try {
      await loadTable(1);
    } catch (error) {
      setMessage(error.message, 'error');
    }
  });

  elements.prevPage.addEventListener('click', () => {
    if (state.page > 1) {
      loadTable(state.page - 1).catch((error) => setMessage(error.message, 'error'));
    }
  });

  elements.nextPage.addEventListener('click', () => {
    loadTable(state.page + 1).catch((error) => setMessage(error.message, 'error'));
  });
}

bindEvents();
loadDashboard();
