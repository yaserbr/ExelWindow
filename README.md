# Excel Statistics Dashboard

A simple Node.js and Express web app that reads Excel workbooks, stores the extracted data in a local JSON file, and displays statistics and charts for every sheet in the workbook.

## Overview

The app has one public page at `/`. Any visitor can view the dashboard and upload a new Excel file. Uploading a file overwrites the previous extracted data.

## Features

- Reads `.xlsx` and `.xls` files.
- Processes only the first four workbook sheets: the first sheet as the summary and the next three sheets as detail sheets.
- Detects the most likely header row in each sheet.
- Stores extracted data in `data/data.json`.
- Always shows the first workbook sheet as compact workbook-style summary tables, regardless of its name.
- Shows one tab for each of the next three detail sheets.
- Keeps detail-sheet statistics collapsed until a user selects a column button.
- Adds value filters for the selected column and recalculates the statistics/chart from the filtered rows.
- Shows column type, blank values, numeric statistics, text statistics, date statistics, and three matching charts for the selected column.
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
http://localhost:4000
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
