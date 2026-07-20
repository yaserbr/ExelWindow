const state = {
  statistics: null,
  activeSheet: '',
  selectedColumn: '',
  chartInstance: null
};

const elements = {
  messageBox: document.getElementById('messageBox'),
  loadingState: document.getElementById('loadingState'),
  emptyState: document.getElementById('emptyState'),
  dashboardContent: document.getElementById('dashboardContent'),
  firstSheetPanel: document.getElementById('firstSheetPanel'),
  firstSheetTitle: document.getElementById('firstSheetTitle'),
  firstSheetTables: document.getElementById('firstSheetTables'),
  sheetTabs: document.getElementById('sheetTabs'),
  columnsList: document.getElementById('columnsList'),
  selectedColumnPanel: document.getElementById('selectedColumnPanel'),
  selectedColumnTitle: document.getElementById('selectedColumnTitle'),
  selectedColumnStats: document.getElementById('selectedColumnStats'),
  chartTitle: document.getElementById('chartTitle'),
  chartCanvas: document.getElementById('chartCanvas'),
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
  }, 4500);
}

function setMainLoading(isLoading) {
  elements.loadingState.classList.toggle('hidden', !isLoading);
}

function getFirstWorkbookSheet() {
  return state.statistics?.sheets?.[0] || null;
}

function getDetailSheets() {
  return (state.statistics?.sheets || []).slice(1, 4);
}

function getActiveSheetStats() {
  const detailSheets = getDetailSheets();
  return detailSheets.find((sheet) => sheet.sheetName === state.activeSheet) || detailSheets[0] || null;
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

  splitIntoTables(firstSheet.rawRows).forEach((sourceRows) => {
    const rows = compactTableRows(sourceRows);
    const firstRowValues = rows[0]?.filter((cell) => String(cell || '').trim() !== '') || [];
    const hasStandaloneTitle = firstRowValues.length === 1 && rows.length > 1;
    const titleText = hasStandaloneTitle ? String(firstRowValues[0]).trim() : '';
    const shouldShowTitle = titleText && titleText.toLowerCase() !== firstSheet.sheetName.toLowerCase();
    const tableRows = hasStandaloneTitle ? rows.slice(1) : rows;
    const tableCard = document.createElement('article');
    tableCard.className = 'mini-table-card';

    if (shouldShowTitle) {
      tableCard.append(createTextElement('h3', '', titleText));
    }

    const table = document.createElement('table');
    table.className = 'mini-table';

    tableRows.forEach((row, rowIndex) => {
      const tableRow = document.createElement('tr');
      const filledCells = row.filter((cell) => String(cell || '').trim() !== '').length;

      row.forEach((cell) => {
        const cellElement = document.createElement(rowIndex === 0 && filledCells > 1 ? 'th' : 'td');
        cellElement.textContent = String(cell || '');
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

function createMetric(label, value) {
  const item = document.createElement('div');
  item.append(createTextElement('span', '', label));
  item.append(createTextElement('strong', '', value));
  return item;
}

function renderNumericColumn(column, stats, details) {
  elements.selectedColumnStats.append(
    createMetric('Rows', formatNumber(details.nonEmptyCount)),
    createMetric('Blank', formatNumber(details.emptyCount)),
    createMetric('Total', formatNumber(stats?.sum)),
    createMetric('Average', formatNumber(stats?.average)),
    createMetric('Maximum', formatNumber(stats?.max)),
    createMetric('Minimum', formatNumber(stats?.min))
  );
}

function renderTextColumn(stats, details) {
  elements.selectedColumnStats.append(
    createMetric('Rows', formatNumber(details.nonEmptyCount)),
    createMetric('Blank', formatNumber(details.emptyCount)),
    createMetric('Unique Values', formatNumber(stats?.uniqueCount))
  );

  const topValues = document.createElement('div');
  topValues.className = 'top-values full-width';

  (stats?.topValues || []).forEach((item) => {
    const row = document.createElement('div');
    row.className = 'value-row';
    row.append(createTextElement('strong', '', item.value));
    row.append(createTextElement('span', '', formatNumber(item.count)));
    topValues.append(row);
  });

  if (topValues.childElementCount) {
    elements.selectedColumnStats.append(topValues);
  }
}

function renderDateColumn(stats, details) {
  elements.selectedColumnStats.append(
    createMetric('Rows', formatNumber(details.nonEmptyCount)),
    createMetric('Blank', formatNumber(details.emptyCount)),
    createMetric('Oldest', formatDate(stats?.oldest)),
    createMetric('Latest', formatDate(stats?.latest)),
    createMetric('Months', formatNumber(Object.keys(stats?.monthlyCounts || {}).length))
  );
}

function destroyChart() {
  if (state.chartInstance) {
    state.chartInstance.destroy();
    state.chartInstance = null;
  }
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
  destroyChart();

  const chartData = getChartData(sheetStatistics, column);
  elements.chartTitle.textContent = chartData.title;

  if (!chartData.labels.length) {
    return;
  }

  state.chartInstance = new Chart(elements.chartCanvas, {
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
}

function renderSelectedColumn() {
  const sheetStatistics = getActiveSheetStats();
  clearElement(elements.selectedColumnStats);
  destroyChart();

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

  if (details.type === 'numeric') {
    renderNumericColumn(column, sheetStatistics.numericStats[column], details);
  } else if (details.type === 'date') {
    renderDateColumn(sheetStatistics.dateStats[column], details);
  } else {
    renderTextColumn(sheetStatistics.textStats[column], details);
  }

  renderChart(sheetStatistics, column);
  elements.selectedColumnPanel.classList.remove('hidden');
}

function renderActiveSheet() {
  const sheetStatistics = getActiveSheetStats();

  renderFirstSheet();

  if (!sheetStatistics) {
    clearElement(elements.sheetTabs);
    clearElement(elements.columnsList);
    elements.selectedColumnPanel.classList.add('hidden');
    return;
  }

  state.activeSheet = sheetStatistics.sheetName;
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
    renderActiveSheet();
  });

  elements.columnsList.addEventListener('click', (event) => {
    const button = event.target.closest('.column-button');
    if (!button) {
      return;
    }

    state.selectedColumn = button.dataset.column;
    renderColumnButtons(getActiveSheetStats());
    renderSelectedColumn();
  });
}

bindEvents();
loadDashboard();
