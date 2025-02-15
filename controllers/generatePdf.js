const PdfPrinter = require("pdfmake");
const path = require("path");
const fs = require("fs");
const { format } = require("date-fns");
const { buffer } = require("stream/consumers");
const { text } = require("body-parser");

// Define font styles
const fonts = {
  Roboto: {
    normal: path.join(__dirname, "fonts/Roboto-Regular.ttf"),
    bold: path.join(__dirname, "fonts/Roboto-Medium.ttf"),
    italics: path.join(__dirname, "fonts/Roboto-Italic.ttf"),
    bolditalics: path.join(__dirname, "fonts/Roboto-MediumItalic.ttf"),
  },
  bigHeadingFont: {
    normal: path.join(__dirname, "fonts/DMSerifText-Regular.ttf"),
    bold: path.join(__dirname, "fonts/DMSerifText-Regular.ttf"),
  },
};

const printer = new PdfPrinter(fonts);

// header definition
const header = {
  margin: [40, 20, 40, 15],
  stack: [
    {
      columns: [
        {
          // College logo
          image: path.join(
            __dirname,
            "..",
            "public",
            "assets",
            "Img",
            "collegeLogo.png"
          ),
          width: 80,
          //   height: 60,
        },
        {
          // College name with subheading
          stack: [
            // {
            //   text: "ਗੁਰੂ ਨਾਨਕ ਦੇਵ ਇੰਜੀਨੀਅਰਿੰਗ ਕਾਲਜ਼",
            //   alignment: "center",
            //   fontSize: 25,
            //   color: "#cf1e18",
            //   bold: true,
            // },
            {
              text: "Guru Nanak Dev Engineering College",
              alignment: "center",
              fontSize: 25,
              color: "#0d0046",
              bold: true,
            },
            {
              text: "An Autonomous College Under UGC Act 1956",
              alignment: "center",
              fontSize: 14,
              color: "#cf1e18",
              bold: true,
            },
          ],
          margin: [10, 10, 0, 0],
        },
      ],
    },
    {
      canvas: [
        {
          type: "line",
          x1: 0,
          y1: 0,
          x2: 515, // Full width of A4 minus margins
          y2: 0,
          lineWidth: 1.5,
          color: "#000000", // Black line
        },
      ],
      margin: [0, 10, 0, 0], // Top and bottom spacing
    },
  ],
};

// Footer definition
const footer = {
  margin: [40, 10, 40, 0],
  stack: [
    {
      canvas: [
        {
          type: "line",
          x1: 0,
          y1: 0,
          x2: 515, // Full width of A4 minus margins
          y2: 0,
          lineWidth: 1.5,
          color: "#000000", // Black line
        },
      ],
    },
    {
      text: "Gill Park, Gill Road, Ludhiana-141006 Punjab",
      alignment: "center",
      fontSize: 10,
      color: "grey",
      margin: [0, 10, 0, 0],
    },
  ],
};

// Function to generate PDF
async function generatePDF(
  faculty,
  leaveData,
  fromDate,
  toDate,
  departmentName
) {
  fromDate = fromDate && format(new Date(fromDate), "dd/MM/yyyy");
  toDate = toDate && format(new Date(toDate), "dd/MM/yyyy");
  let sn = 1;

  const countCategories = leaveData.reduce((acc, curr) => {
    if (acc[curr.leave_category]) {
      acc[curr.leave_category] += 1;
    } else {
      acc[curr.leave_category] = 1;
    }

    return acc;
  }, {});

  countCategories.total_leaves = Object.entries(countCategories).reduce(
    (acc, [key, value]) => {
      if (key === "short_leaves") {
        acc += value % 3 === 0 ? value / 3 : 0.33 * value;
      } else if (key === "half_day_leaves") {
        acc += value * 0.5;
      } else if (key === "casual_leaves") {
        acc += value;
      }
      return acc;
    },
    0
  );

  countCategories.remaining_leaves = faculty.remaining_leaves;

  const docDefinition = {
    // Page settings
    pageSize: "A4",
    pageMargins: [40, 120, 40, 70], // left, top, right, bottom
    header: header,
    footer: footer,

    content: [
      {
        text: `Department of ${departmentName}`,
        style: "heading",
        alignment: "center",
        fontSize: 17,
        bold: true,
      },
      // Leave Details Heading
      {
        text: `Leave Details - ${faculty.faculty_name} (${faculty.designation})`,
        style: "heading",
        margin: [0, 20, 0, 10],
      },

      // Date Range
      {
        text: `Date Range: ${fromDate} to ${toDate}`,
        margin: [0, 0, 0, 20],
      },

      // Leave Details Table
      {
        table: {
          headerRows: 1,
          widths: ["auto", "*", "*"], // SN will auto-size, others will share remaining space
          body: [
            // Header row
            [
              { text: "SN", style: "tableHeader" },
              { text: "Leave Category", style: "tableHeader" },
              { text: "Leave Date", style: "tableHeader" },
            ],
            // Data rows will be added dynamically
            ...leaveData.map((leaveObj) => {
              const leaveType = `${leaveObj.leave_category
                .replace(/_/g, " ")
                .replace(/\b\w/g, (char) => char.toUpperCase())
                .replace(/\bLeaves\b/i, "Leave")
                .replace(/\bCasual Leaves\b/i, "Full Day Leave")
                .replace(/\bMedical Leaves\b/i, "Medical/Maternity Leave")} ${
                ((leaveObj.short_leave_from || leaveObj.half_leave_type) &&
                  `(${
                    leaveObj.half_leave_type
                      ?.replace(/_/g, " ")
                      .replace(/\b\w/g, (char) => char.toUpperCase()) ||
                    leaveObj.short_leave_from + " to " + leaveObj.short_leave_to
                  })`) ||
                ""
              }`;
              const leaveDate = format(
                new Date(leaveObj.leave_date),
                "dd/MM/yyyy"
              );
              return [sn++, leaveType, leaveDate];
            }),
          ],
        },
      },
      {
        stack: [
          {
            text: "Summary",
            style: "heading",
            margin: [0, 0, 0, 10],
            alignment: "left",
          },
          {
            ul: Object.entries(countCategories).map(([key, value]) => {
              const leaveCategory = key
                .replace(/_/g, " ")
                .replace(/\b\w/g, (char) => char.toUpperCase())
                .replace(/\bCasual Leaves\b/i, "Full Day Leaves")
                .replace(/\bMedical Leaves\b/i, "Medical/Maternity Leaves");

              return { text: `${leaveCategory}: ${value}`, fontSize: 12 };
            }),
            margin: [10, 0, 0, 0], // Indent list slightly for better layout
          },
        ],
        margin: [0, 50, 0, 0],
        lineHeight: 1.3,
      },
    ],

    // Styles definition
    styles: {
      heading: {
        fontSize: 14,
        bold: true,
      },
      tableHeader: {
        bold: true,
        fillColor: "#f3f3f3",
        margin: [5, 5, 5, 5],
      },
    },
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);

  return await generatePdfBuffer(pdfDoc);
}

// Function to generate front page
async function generateFrontPage(fromDate, toDate, departmentName) {
  fromDate = fromDate && format(new Date(fromDate), "dd/MM/yyyy");
  toDate = toDate && format(new Date(toDate), "dd/MM/yyyy");
  let sn = 1;
  const docDefinition = {
    // Page settings
    pageSize: "A4",
    pageMargins: [40, 120, 40, 70], // left, top, right, bottom
    header: header,
    footer: footer,

    content: [
      {
        text: `FACULTY\nLEAVE REPORT\n\n${fromDate}\nto\n${toDate}`,
        style: "bigHeading", // Apply custom style
        alignment: "center", // Horizontally center
        margin: [0, 70, 0, 50], // Adjust margins for vertical centering
        width: "auto", // Allow the text to wrap automatically
      },
      {
        text: `Department of\n ${departmentName}`,
        style: "heading",
        alignment: "center",
        margin: [0, 70, 0, 0],
        width: "autO",
      },
    ],
    styles: {
      bigHeading: {
        fontSize: 46,
        font: "bigHeadingFont",
        bold: true,
        color: "#000",
      },

      heading: {
        fontSize: 24,
        bold: true,
        color: "#000",
      },
    },
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);

  return await generatePdfBuffer(pdfDoc);
}

async function generateOneDayReport(oneDayLeaveData, date, departmentName) {
  let sn = 0;
  const docDefinition = {
    pageSize: "A4",
    pageMargins: [40, 120, 40, 70],
    header: header,
    footer: footer,

    content: [
      {
        text: `Department of ${departmentName}`,
        style: "heading",
        alignment: "center",
        fontSize: 17,
        bold: true,
      },
      {
        table: {
          widths: ["auto", "*"],
          body: [
            [
              { text: `To`, margin: [0, 20, 0, 10] },
              {
                text: `${format(date, "dd/MM/yyyy")}`,
                bold: true,
                alignment: "right",
                margin: [0, 20, 0, 10],
              },
            ],
          ],
        },
        layout: "noBorders",
        margin: [0, 20, 0, 0],
      },
      { text: `The Principal`, margin: [0, 0, 0, 20] },

      {
        table: {
          headerRows: 1,
          widths: ["auto", "*", "*"],
          body: [
            [
              { text: "SN", style: "tableHeader" },
              { text: "Leave Category", style: "tableHeader" },
              { text: "Name", style: "tableHeader" },
            ],
            ...oneDayLeaveData.flatMap(([faculty, leaveData]) => {
              if (!Array.isArray(leaveData)) return [];
              return leaveData.map((leaveObj) => {
                const leaveType = `${leaveObj.leave_category
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (char) => char.toUpperCase())
                  .replace(/\bLeaves\b/i, "Leave")
                  .replace(/\bCasual Leaves\b/i, "Full Day Leave")
                  .replace(/\bMedical Leaves\b/i, "Medical/Maternity Leave")} ${
                  leaveObj.short_leave_from || leaveObj.half_leave_type
                    ? `(${
                        leaveObj.half_leave_type
                          ?.replace(/_/g, " ")
                          .replace(/\b\w/g, (char) => char.toUpperCase()) ||
                        leaveObj.short_leave_from +
                          " to " +
                          leaveObj.short_leave_to
                      })`
                    : ""
                }`;

                return [++sn, leaveType, faculty.faculty_name];
              });
            }),
          ],
        },
      },
    ],

    styles: {
      heading: { fontSize: 14, bold: true },
      tableHeader: { bold: true, fillColor: "#f3f3f3", margin: [5, 5, 5, 5] },
    },
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  return await generatePdfBuffer(pdfDoc);
}

function generatePdfBuffer(pdfDoc) {
  const pdfBuffers = [];

  // Pipe the PDF document to the buffer
  pdfDoc.on("data", (chunk) => pdfBuffers.push(chunk));
  pdfDoc.end();

  return new Promise((resolve, reject) => {
    try {
      pdfDoc.on("end", () => {
        const pdfBuffer = Buffer.concat(pdfBuffers);
        resolve(pdfBuffer);
      });
    } catch (err) {
      return console.log(err);
    }
  });
}

module.exports = { generatePDF, generateFrontPage, generateOneDayReport };
