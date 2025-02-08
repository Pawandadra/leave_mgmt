const { PDFDocument } = require("pdf-lib");
const Stream = require("stream");
const express = require("express");
const router = express.Router();
const mysql = require("mysql2");
const { fr } = require("date-fns/locale");

const generateFrontPage =
  require("../controllers/generatePdf").generateFrontPage;
const generatePDF = require("../controllers/generatePdf").generatePDF;

const pool = mysql
  .createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  })
  .promise();

// Route for individual pdf
router.get("/", async (req, res) => {
  const defaultFromDate = new Date();
  const today = new Date();
  defaultFromDate.setDate(today.getDate() - 35);
  const { facultyId, fromDate, toDate } = req.query;

  const sanitizedFromDate =
    fromDate || defaultFromDate.toISOString().split("T")[0];
  const sanitizedToDate = toDate || today.toISOString().split("T")[0];

  if (!facultyId)
    return res
      .status(400)
      .json({ message: "bad request. Employee id not specified." });

  const [[faculty]] = await pool.query(`
      SELECT 
          faculty.id, 
          faculty.faculty_name, 
          faculty.designation, 
          SUM(CASE WHEN leave_category = 'short_leaves' THEN 1 ELSE 0 END) AS short_leaves,
          SUM(CASE WHEN leave_category = 'half_day_leaves' THEN 1 ELSE 0 END) AS half_day_leaves,
          SUM(CASE WHEN leave_category = 'casual_leaves' THEN 1 ELSE 0 END) AS casual_leaves,
          SUM(CASE WHEN leave_category = 'academic_leaves' THEN 1 ELSE 0 END) AS academic_leaves,
          SUM(CASE WHEN leave_category = 'medical_leaves' THEN 1 ELSE 0 END) AS medical_leaves,
          SUM(CASE WHEN leave_category = 'compensatory_leaves' THEN 1 ELSE 0 END) AS compensatory_leaves,
          SUM(CASE WHEN leave_category = 'other_leaves' THEN 1 ELSE 0 END) AS other_leaves,
          faculty.remaining_leaves,
          faculty.total_leaves
      FROM faculty
      LEFT JOIN leaves ON faculty.id = leaves.faculty_id
      WHERE faculty_id = ${facultyId}
      GROUP BY faculty.id
  `);

  const [leaveData] = await pool.query(
    `SELECT * FROM leaves l
     LEFT JOIN leave_details ld ON l.id = ld.leave_id
     WHERE l.faculty_id = ? 
     AND l.leave_date BETWEEN ? AND ?`,
    [facultyId, sanitizedFromDate, sanitizedToDate]
  );

  // Generate Pdf
  const pdfBuffer = await generatePDF(
    faculty,
    leaveData,
    sanitizedFromDate,
    sanitizedToDate
  );
  const pdf = Stream.Readable.from(pdfBuffer);

  // Send Pdf Response
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "inline");

  pdf.pipe(res);
  pdf.on("end", () => {
    res.end(); // Ensure that the response is properly closed after the stream ends
  });
});
// Route to get combined pdf
router.get("/all", async (req, res) => {
  const defaultFromDate = new Date();
  const today = new Date();

  defaultFromDate.setDate(today.getDate() - 35);
  const { facultyId, fromDate, toDate } = req.query;

  const sanitizedFromDate =
    fromDate || defaultFromDate.toISOString().split("T")[0];
  const sanitizedToDate = toDate || today.toISOString().split("T")[0];
  // Fetching data from the database
  const [rows] = await pool.query(`
    SELECT 
        faculty.id, 
        faculty.faculty_name, 
        faculty.designation, 
        SUM(CASE WHEN leave_category = 'short_leaves' THEN 1 ELSE 0 END) AS short_leaves,
        SUM(CASE WHEN leave_category = 'half_day_leaves' THEN 1 ELSE 0 END) AS half_day_leaves,
        SUM(CASE WHEN leave_category = 'casual_leaves' THEN 1 ELSE 0 END) AS casual_leaves,
        SUM(CASE WHEN leave_category = 'academic_leaves' THEN 1 ELSE 0 END) AS academic_leaves,
        SUM(CASE WHEN leave_category = 'medical_leaves' THEN 1 ELSE 0 END) AS medical_leaves,
        SUM(CASE WHEN leave_category = 'compensatory_leaves' THEN 1 ELSE 0 END) AS compensatory_leaves,
        SUM(CASE WHEN leave_category = 'other_leaves' THEN 1 ELSE 0 END) AS other_leaves,
        faculty.remaining_leaves,
        faculty.total_leaves
    FROM faculty
    LEFT JOIN leaves ON faculty.id = leaves.faculty_id
    GROUP BY faculty.id
    ORDER BY 
        faculty.designation DESC,
        REGEXP_REPLACE(faculty.faculty_name, '^(Er\.|Dr\.|Mr\.|Ms\.|Prof\.|S\.|Er|Dr|Mr|Ms|Prof|S)\s*', '') ASC;
`);

  // generate Array of all PDF buffers
  const frontPage = await generateFrontPage(sanitizedFromDate, sanitizedToDate);
  const pdfBuffers = [frontPage];
  for (const faculty of rows) {
    try {
      const [leaveData] = await pool.query(
        `SELECT * FROM leaves l
         LEFT JOIN leave_details ld ON l.id = ld.leave_id
         WHERE l.faculty_id = ?
         AND l.leave_date BETWEEN ? AND ?`,
        [faculty.id, sanitizedFromDate, sanitizedToDate]
      );
      // const [leaveData] = await pool.query(`
      //   select * from leaves where faculty_id = ${faculty.id};
      // `);

      if (leaveData.length === 0) continue;
      const pdfBuffer = await generatePDF(
        faculty,
        leaveData,
        sanitizedFromDate,
        sanitizedToDate
      );
      pdfBuffers.push(pdfBuffer);
    } catch (err) {
      console.error("Error fetching leave data:", err);
    }
  }

  // Create a merged PDF
  const mergedPdf = await PDFDocument.create();

  for (const pdfBfr of pdfBuffers) {
    const pdfDoc = await PDFDocument.load(pdfBfr);
    const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
    pages.forEach((page) => mergedPdf.addPage(page));
  }
  const mergedPdfBytes = await mergedPdf.save();

  // Send Merged PDF as response
  const readableStream = Stream.Readable.from([mergedPdfBytes]);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="leave_data.pdf"`);

  readableStream.pipe(res);
  readableStream.on("end", () => {
    res.end(); // Ensure that the response is properly closed after the stream ends
  });
});

module.exports = router;
