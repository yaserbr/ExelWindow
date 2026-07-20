# Excel Statistics Dashboard

A simple Node.js and Express web app that reads Excel workbooks, stores the extracted data in a local JSON file, and displays statistics, charts, and paginated tables for every sheet in the workbook.

## Overview

The app has one public page at `/`. Any visitor can view the dashboard and upload a new Excel file. Uploading a file overwrites the previous extracted data.

## Features

- Reads `.xlsx` and `.xls` files.
- Processes all workbook sheets, not only the first sheet.
- Detects the most likely header row in each sheet.
- Stores extracted data in `data/data.json`.
- Shows one tab per sheet.
- Shows summary cards, column types, blank value counts, numeric statistics, text statistics, date statistics, charts, and a searchable table.
- Keeps table search, sorting, and pagination on the server.
- Limits uploads to 10MB and rate-limits the upload endpoint.

## Install

```bash
npm install
```

## Run

```bash
npm start
```

Development mode:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Uploading Excel Files

Click **Upload New Excel**, choose an `.xlsx` or `.xls` file, then submit. The app reads all sheets and replaces the old data in:

```text
data/data.json
```

The original Excel file is not stored permanently.

## Supported Data Shape

The app does not require fixed column names. For each sheet, it detects the likely header row, removes empty trailing columns, ignores empty rows, and analyzes the available columns automatically.

For numeric columns it calculates:

- Total
- Average
- Maximum
- Minimum
- Numeric value count

For text columns it calculates:

- Unique value count
- Top five values
- Frequency counts

For date columns it calculates:

- Oldest date
- Latest date
- Monthly record counts when possible

## API

Get paginated rows for a sheet:

```text
GET /api/data?sheet=SheetName&page=1&limit=20&search=&sortBy=&sortDir=asc
```

Get workbook and per-sheet statistics:

```text
GET /api/statistics
```

Upload and replace Excel data:

```text
POST /api/upload
```

The upload field name is:

```text
excelFile
```

## Deployment on Railway or Render

1. Push the project to a Git repository.
2. Create a Node.js service on Railway or Render.
3. Set the install command:

```bash
npm install
```

4. Set the start command:

```bash
npm start
```

Because the extracted data is saved in a local JSON file, use persistent storage if you need uploaded data to survive restarts or redeployments.
