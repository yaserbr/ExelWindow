require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const adminAuth = require('./middleware/adminAuth');
const { ensureDataFile, loadStoredData, replaceDataFromExcel } = require('./services/excelService');
const { buildStatistics, compareCellValues, formatCellValue } = require('./services/statisticsService');

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const allowedExtensions = new Set(['.xlsx', '.xls']);
const allowedMimeTypes = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/octet-stream',
  'application/zip'
]);

app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"]
      }
    }
  })
);

app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use('/vendor/chart.js', express.static(path.join(__dirname, 'node_modules', 'chart.js', 'dist')));
app.use(express.static(path.join(__dirname, 'public')));

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    message: 'تم تجاوز عدد محاولات رفع الملفات. حاول مرة أخرى بعد قليل.'
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_SIZE,
    files: 1
  },
  fileFilter(req, file, callback) {
    const extension = path.extname(file.originalname).toLowerCase();

    if (!allowedExtensions.has(extension)) {
      return callback(new Error('يسمح برفع ملفات Excel فقط بصيغة .xlsx أو .xls.'));
    }

    if (!allowedMimeTypes.has(file.mimetype)) {
      return callback(new Error('نوع الملف غير مسموح. يرجى رفع ملف Excel صالح.'));
    }

    return callback(null, true);
  }
});

function parsePositiveInteger(value, fallback, maxValue) {
  const numberValue = Number.parseInt(value, 10);

  if (!Number.isFinite(numberValue) || numberValue < 1) {
    return fallback;
  }

  return Math.min(numberValue, maxValue);
}

function findSheet(storedData, requestedSheetName) {
  const sheets = storedData.sheets || [];

  if (!sheets.length) {
    return {
      name: '',
      columns: [],
      rows: []
    };
  }

  if (!requestedSheetName) {
    return sheets.find((sheet) => sheet.rows.length > 0) || sheets[0];
  }

  return sheets.find((sheet) => sheet.name === requestedSheetName) || sheets[0];
}

function rowMatchesSearch(row, columns, searchTerm) {
  if (!searchTerm) {
    return true;
  }

  const normalizedSearch = searchTerm.toLowerCase();

  return columns.some((column) => formatCellValue(row[column]).toLowerCase().includes(normalizedSearch));
}

function getPagedRows(storedData, query) {
  const selectedSheet = findSheet(storedData, typeof query.sheet === 'string' ? query.sheet : '');
  const columns = selectedSheet.columns || [];
  const page = parsePositiveInteger(query.page, 1, Number.MAX_SAFE_INTEGER);
  const limit = parsePositiveInteger(query.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const search = typeof query.search === 'string' ? query.search.trim().slice(0, 100) : '';
  const sortBy = columns.includes(query.sortBy) ? query.sortBy : '';
  const sortDir = query.sortDir === 'desc' ? 'desc' : 'asc';

  let rows = (selectedSheet.rows || []).filter((row) => rowMatchesSearch(row, columns, search));

  if (sortBy) {
    rows = [...rows].sort((a, b) => {
      const comparison = compareCellValues(a[sortBy], b[sortBy]);
      return sortDir === 'desc' ? comparison * -1 : comparison;
    });
  }

  const totalRows = rows.length;
  const totalPages = Math.max(Math.ceil(totalRows / limit), 1);
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;

  return {
    sheetName: selectedSheet.name,
    rows: rows.slice(start, start + limit),
    columns,
    pagination: {
      page: safePage,
      limit,
      totalRows,
      totalPages,
      search,
      sortBy,
      sortDir
    },
    updatedAt: storedData.updatedAt || null
  };
}

function handleMulterError(error) {
  if (!error) {
    return null;
  }

  if (error.code === 'LIMIT_FILE_SIZE') {
    return {
      status: 400,
      message: 'حجم الملف أكبر من الحد المسموح وهو 10MB.'
    };
  }

  return {
    status: 400,
    message: error.message || 'تعذر رفع الملف.'
  };
}

app.get('/api/data', async (req, res, next) => {
  try {
    const storedData = await loadStoredData();
    res.json(getPagedRows(storedData, req.query));
  } catch (error) {
    next(error);
  }
});

app.get('/api/statistics', async (req, res, next) => {
  try {
    const storedData = await loadStoredData();
    res.json(buildStatistics(storedData));
  } catch (error) {
    next(error);
  }
});

app.post('/api/upload', uploadLimiter, adminAuth, (req, res) => {
  upload.single('excelFile')(req, res, async (uploadError) => {
    const friendlyUploadError = handleMulterError(uploadError);

    if (friendlyUploadError) {
      return res.status(friendlyUploadError.status).json({
        message: friendlyUploadError.message
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: 'يرجى اختيار ملف Excel للرفع.'
      });
    }

    try {
      const extractedData = await replaceDataFromExcel(req.file.buffer, req.file.originalname);

      return res.json({
        message: 'تم تحديث البيانات بنجاح.',
        sheetCount: extractedData.fileInfo.sheetCount,
        rowCount: extractedData.fileInfo.totalRows,
        columnCount: extractedData.fileInfo.totalColumns,
        updatedAt: extractedData.updatedAt
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;

      return res.status(statusCode).json({
        message: statusCode === 400 ? error.message : 'حدث خطأ أثناء قراءة ملف Excel.'
      });
    }
  });
});

app.use('/api', (req, res) => {
  res.status(404).json({
    message: 'المسار المطلوب غير موجود.'
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).json({
    message: 'حدث خطأ غير متوقع. يرجى المحاولة لاحقًا.'
  });
});

ensureDataFile()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Excel dashboard is running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize data file:', error);
    process.exit(1);
  });
