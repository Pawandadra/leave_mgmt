const { PDFDocument } = require("pdf-lib");
const Stream = require("stream");
const express = require("express");
const router = express.Router();
const mysql = require("mysql2");

const generateFrontPage =
  require("../controllers/generatePdf").generateFrontPage;
const generatePDF = require("../controllers/generatePdf").generatePDF;
const generateOneDayReport =
  require("../controllers/generatePdf").generateOneDayReport;

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

// Route for individual PDF
router.get("/", async (req, res) => {
  console.log(req.session.user);

  try {
    const defaultFromDate = new Date();
    const today = new Date();
    defaultFromDate.setDate(today.getDate() - 35);
    const { facultyId, fromDate, toDate } = req.query;

    const sanitizedFromDate =
      fromDate || defaultFromDate.toISOString().split("T")[0];
    const sanitizedToDate = toDate || today.toISOString().split("T")[0];

    if (!facultyId) {
      return res
        .status(400)
        .json({ message: "Bad request. Employee ID not specified." });
    }

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

    if (!faculty) {
      return res.status(404).json({ error: "Faculty not found." });
    }

    const [leaveData] = await pool.query(
      `SELECT * FROM leaves l
       LEFT JOIN leave_details ld ON l.id = ld.leave_id
       WHERE l.faculty_id = ? 
       AND l.leave_date BETWEEN ? AND ?`,
      [facultyId, sanitizedFromDate, sanitizedToDate]
    );

    if (leaveData.length === 0) {
      return res.status(404).json({ error: "No leave data found." });
    }

    const [department] = await pool.query(
      `SELECT * FROM departments
      WHERE department_id = ?`,
      [req.session.user.departmentId]
    );

    // Generate PDF
    const pdfBuffer = await generatePDF(
      faculty,
      leaveData,
      sanitizedFromDate,
      sanitizedToDate,
      department[0].department_name
    );
    const pdf = Stream.Readable.from(pdfBuffer);

    // Send PDF Response
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline");

    pdf.pipe(res);
    pdf.on("end", () => res.end());
  } catch (error) {
    console.error("Error processing PDF request:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Route to get combined PDF
router.get("/all", async (req, res) => {
  try {
    const defaultFromDate = new Date();
    const today = new Date();

    defaultFromDate.setDate(today.getDate() - 35);
    const { fromDate, toDate } = req.query;

    const sanitizedFromDate =
      fromDate || defaultFromDate.toISOString().split("T")[0];
    const sanitizedToDate = toDate || today.toISOString().split("T")[0];

    // Fetching faculty data
    const [rows] = await pool.query(
      `
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
      WHERE faculty.department_id = ?
      GROUP BY faculty.id
      ORDER BY 
          faculty.designation DESC,
          REGEXP_REPLACE(faculty.faculty_name, '^(Er\.|Dr\.|Mr\.|Ms\.|Prof\.|S\.|Er|Dr|Mr|Ms|Prof|S)\s*', '') ASC;
    `,
      [req.session.user.departmentId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "No faculty data found." });
    }

    const designationPriority = {
      Professor: 1,
      "Associate Professor": 2,
      "Assistant Professor": 3,
      Clerk: 4,
      "Lab Technician": 5,
      "Lab Attendant": 6,
      Attendant: 7,
    };

    rows.sort((a, b) => {
      const designationComparison =
        designationPriority[a.designation] - designationPriority[b.designation];
      return designationComparison;
    });

    const [department] = await pool.query(
      `SELECT * FROM departments
      WHERE department_id = ?`,
      [req.session.user.departmentId]
    );

    // Generate PDFs
    const frontPage = await generateFrontPage(
      sanitizedFromDate,
      sanitizedToDate,
      department[0].department_name
    );
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

        if (leaveData.length === 0) continue;

        const pdfBuffer = await generatePDF(
          faculty,
          leaveData,
          sanitizedFromDate,
          sanitizedToDate,
          department[0].department_name
        );
        pdfBuffers.push(pdfBuffer);
      } catch (err) {
        console.error(
          `Error fetching leave data for faculty ${faculty.id}:`,
          err
        );
      }
    }

    // Merge PDFs
    const mergedPdf = await PDFDocument.create();

    for (const pdfBfr of pdfBuffers) {
      try {
        const pdfDoc = await PDFDocument.load(pdfBfr);
        const pages = await mergedPdf.copyPages(
          pdfDoc,
          pdfDoc.getPageIndices()
        );
        pages.forEach((page) => mergedPdf.addPage(page));
      } catch (err) {
        console.error("Error merging PDFs:", err);
      }
    }

    const mergedPdfBytes = await mergedPdf.save();

    // Send Merged PDF as response
    const readableStream = Stream.Readable.from([mergedPdfBytes]);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="leave_data.pdf"`);

    readableStream.pipe(res);
    readableStream.on("end", () => res.end());
  } catch (error) {
    console.error("Error processing combined PDF request:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Route to get Todays (one day) report
router.get("/todays-report", async (req, res) => {
  console.log("req for todays report came");

  try {
    const today = new Date();
    const date = today.toISOString().split("T")[0];

    // Fetching faculty data
    const [rows] = await pool.query(
      `
      SELECT 
          faculty.id, 
          faculty.faculty_name, 
          faculty.designation,
          faculty.remaining_leaves,
          faculty.total_leaves
      FROM faculty
      LEFT JOIN leaves ON faculty.id = leaves.faculty_id
      WHERE faculty.department_id = ?
      GROUP BY faculty.id
      ORDER BY 
          faculty.designation DESC,
          REGEXP_REPLACE(faculty.faculty_name, '^(Er\.|Dr\.|Mr\.|Ms\.|Prof\.|S\.|Er|Dr|Mr|Ms|Prof|S)\s*', '') ASC;
    `,
      [req.session.user.departmentId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "No faculty data found." });
    }

    const [department] = await pool.query(
      `SELECT * FROM departments
      WHERE department_id = ?`,
      [req.session.user.departmentId]
    );

    // Generate PDFs
    const oneDayLeaveData = [];

    for (const faculty of rows) {
      try {
        const [leaveData] = await pool.query(
          `SELECT * FROM leaves l
           LEFT JOIN leave_details ld ON l.id = ld.leave_id
           WHERE l.faculty_id = ?
           AND l.leave_date = ?`,
          [faculty.id, date]
        );
        if (leaveData.length === 0) continue;

        oneDayLeaveData.push([faculty, leaveData]);
      } catch (err) {
        console.error(`Error fetching leaveData for ${faculty.id} `, err);
      }
    }
    console.log(oneDayLeaveData, "asagohan leavedata");

    if (oneDayLeaveData.length === 0) {
      return res
        .status(404)
        .json({ error: `No leave records found for today i.e. ${date}` });
    }
    const pdfBuffer = await generateOneDayReport(
      oneDayLeaveData,
      date,
      department[0].department_name
    );

    const pdf = Stream.Readable.from(pdfBuffer);
    pdf.pipe(res);
    pdf.on("end", () => res.end());

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="leave_data.pdf"`);
  } catch (error) {
    console.error("Error processing combined PDF request:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;
