const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const mysql = require("mysql2");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);
const md5 = require("md5");
const path = require("path");
require("dotenv").config();

const port = process.env.PORT;
app.use(bodyParser.json());

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

// Create a session store instance
const sessionStore = new MySQLStore({}, pool);

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      path: "/",
      secure: process.env.NODE_ENV === "production", // Set to true if using HTTPS
      httpOnly: true, // Prevent client-side access to cookies
      maxAge: 86400000, // 1 day expiration
    },
  })
);

// app.use("/", express.static(path.join(__dirname, "public")));

// Serve static files from the "public" directory
app.use("/leave_mgmt", express.static(path.join(__dirname, "public")));
app.set("trust proxy", 1);

// Serve login page at /leave_mgmt
app.get("/leave_mgmt/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Login route
app.post("/leave_mgmt/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Missing username or password" });
  }

  try {
    const hashedPassword = md5(password);
    const [users] = await pool.query(
      "SELECT * FROM users WHERE username = ? AND password = ?",
      [username, hashedPassword]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Store user session data
    req.session.user = {
      id: users[0].id,
      username: users[0].username,
    };

    res.json({ message: "Login successful" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// Middleware to authenticate session
const authenticateSession = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: "Unauthorized. Please log in." });
  }
  next();
};
exports.authenticateSession = authenticateSession;

// Serve dashboard after authentication
app.get("/leave_mgmt/dashboard", authenticateSession, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "main.html"));
});

// Route: Get all faculty leave data
app.get("/leave_mgmt/get-leaves", authenticateSession, async (req, res) => {
  try {
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
        SUM(CASE WHEN leave_category = 'remaining_leaves' THEN 1 ELSE 0 END) AS remaining_leaves,
        faculty.remaining_leaves,
        faculty.granted_leaves,
        faculty.total_leaves
      FROM faculty
      LEFT JOIN leaves ON faculty.id = leaves.faculty_id
      GROUP BY faculty.id
      ORDER BY faculty.id;
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch leave data" });
  }
});

// Route: Add leave
app.post("/leave_mgmt/add-leave", authenticateSession, async (req, res) => {
  const { faculty_id, leave_categoryArr, leave_date } = req.body;
  const [leave_category, secLeaveOption] = leave_categoryArr;

  const validLeaveCategories = [
    "short_leaves",
    "half_day_leaves",
    "casual_leaves",
    "academic_leaves",
    "medical_leaves",
    "compensatory_leaves",
    "remaining_leaves",
    "granted_leaves",
  ];

  if (!validLeaveCategories.includes(leave_category)) {
    return res.status(400).json({ error: "Invalid leave category" });
  }
  if (!faculty_id || !leave_category || !leave_date) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    if (leave_category === "short_leaves") {
      if (!secLeaveOption.fromTime || !secLeaveOption.toTime) {
        return res.status(400).json({ error: "Bad Request: Invalid Time" });
      }

      const [fromHours, fromMinutes, fromSeconds = 0] = secLeaveOption.fromTime
        .split(":")
        .map(Number);
      const [toHours, toMinutes, toSeconds = 0] = secLeaveOption.toTime
        .split(":")
        .map(Number);
      const fromTimeInSeconds =
        fromHours * 60 * 60 + fromMinutes * 60 + fromSeconds;
      const toTimeInSeconds = toHours * 60 * 60 + toMinutes * 60 + toSeconds;

      if (fromTimeInSeconds > toTimeInSeconds) {
        return res.status(400).json({ error: "Bad Request, Invalid time." });
      }

      // Fetch current leave counts for the faculty
      const [rows] = await connection.query(
        `
        SELECT 
            (SELECT COUNT(*) FROM leaves WHERE faculty_id = ? AND leave_category = 'short_leaves') AS short_leaves_count,
            total_leaves,
            remaining_leaves,
            granted_leaves
        FROM faculty
        WHERE id = ?;
        `,
        [faculty_id, faculty_id]
      );

      let {
        short_leaves_count = 0,
        total_leaves = 0,
        remaining_leaves,
        granted_leaves,
      } = rows[0];
      short_leaves_count += 1; // Increment short leaves count

      let newTotalLeaves = parseFloat(total_leaves) + 0.33; // Default increment

      // If short_leaves_count is a multiple of 3, add 1 to total leaves
      if (short_leaves_count % 3 === 0) {
        newTotalLeaves = newTotalLeaves + 0.01;
      }

      newTotalLeaves = parseFloat(newTotalLeaves.toFixed(2));
      remaining_leaves = parseFloat(
        (granted_leaves - newTotalLeaves).toFixed(2)
      );

      // Insert the leave record
      const [leaveResult] = await connection.query(
        `
          INSERT INTO leaves (faculty_id, leave_category, leave_date)
          VALUES (?, ?, ?);
          `,
        [faculty_id, leave_category, leave_date]
      );

      // Update Leave Details
      await connection.query(
        `INSERT INTO leave_details (leave_id, short_leave_from, short_leave_to) VALUES (?, ?, ?)`,
        [leaveResult.insertId, secLeaveOption.fromTime, secLeaveOption.toTime]
      );

      // Update the total leaves in faculty table
      await connection.query(
        `
          UPDATE faculty
          SET 
            total_leaves = ?,
            remaining_leaves = ?
          WHERE id = ?;
          `,
        [newTotalLeaves, remaining_leaves, faculty_id]
      );

      await connection.commit();
      return res.json({
        status: "success",
        updatedData: {
          short_leaves: short_leaves_count,
          total_leaves: newTotalLeaves,
        },
      });
    } else if (leave_category === "half_day_leaves") {
      if (
        !(secLeaveOption === "before_noon") &&
        !(secLeaveOption === "after_noon")
      ) {
        return res
          .status(400)
          .json({ error: "Bad Request: Invalid Leave Option" });
      }
      const [leaveResult] = await connection.query(
        `
        INSERT INTO leaves (faculty_id, leave_category, leave_date)
        VALUES (?, ?, ?);
      `,
        [faculty_id, leave_category, leave_date]
      );

      // Insert leave Details
      await connection.query(
        `INSERT INTO leave_details (leave_id, half_leave_type) VALUES (?, ?)`,
        [leaveResult.insertId, secLeaveOption]
      );

      await connection.query(
        `
        UPDATE faculty
        SET 
          total_leaves = total_leaves + 0.5,
          remaining_leaves = remaining_leaves - 0.5

        WHERE id = ?;
      `,
        [faculty_id]
      );

      await connection.commit();
      return res.json({ status: "success" });
    } else if (leave_category === "granted_leaves") {
      if (!Number(secLeaveOption)) {
        return res.status(400).json({ error: "Bad Request: Invalid Value." });
      }
      await connection.query(
        `UPDATE faculty
        SET
          remaining_leaves = remaining_leaves + ?,
          granted_leaves = granted_leaves + ?
        WHERE id = ?
        `,
        [Number(secLeaveOption), Number(secLeaveOption), faculty_id]
      );

      await connection.commit();
      return res.json({ status: "success" });
    } else if (leave_category === "casual_leaves") {
      const fromDate = new Date(leave_date[0]);
      const toDate = new Date(leave_date[1]);
      const days = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1;

      if (fromDate > toDate) {
        return res
          .status(400)
          .json({ error: "Bad Request, Invalid Date range." });
      }
      const leaveInserts = [];
      for (let i = 0; i < days; i++) {
        const newLeaveDate = new Date(fromDate);
        newLeaveDate.setDate(fromDate.getDate() + i);

        leaveInserts.push(
          connection.query(
            `
            INSERT INTO leaves (faculty_id, leave_category, leave_date)
            VALUES (?, ?, ?);
          `,
            [faculty_id, leave_category, newLeaveDate]
          ),
          connection.query(
            `
            UPDATE faculty
            SET total_leaves = total_leaves + 1,
            remaining_leaves = remaining_leaves - 1
            WHERE id = ?;
            `,
            [faculty_id]
          )
        );
      }

      await Promise.all(leaveInserts);

      await connection.commit();
      return res.json({ status: "success" });
    } else {
      // Handle other leave categories
      const fromDate = new Date(leave_date[0]);
      const toDate = new Date(leave_date[1]);
      const days = Math.ceil((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1;

      if (fromDate > toDate) {
        return res
          .status(400)
          .json({ error: "Bad Request, Invalid Date range." });
      }

      const leaveInserts = [];
      for (let i = 0; i < days; i++) {
        const newLeaveDate = new Date(fromDate);
        newLeaveDate.setDate(fromDate.getDate() + i);

        leaveInserts.push(
          connection.query(
            `
            INSERT INTO leaves (faculty_id, leave_category, leave_date)
            VALUES (?, ?, ?);
          `,
            [faculty_id, leave_category, newLeaveDate]
          )
        );
      }

      await Promise.all(leaveInserts);

      // await connection.query(
      //   `
      //   UPDATE faculty
      //   SET
      //     total_leaves = total_leaves + ?,
      //     remaining_leaves = remaining_leaves - ?
      //   WHERE id = ?;
      // `,
      //   [days, days, faculty_id]
      // );

      await connection.commit();
      return res.json({ status: "success" });
    }
  } catch (err) {
    if (connection) await connection.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to add leave" });
  } finally {
    if (connection) connection.release();
  }
});

// Route: Add faculty
app.post("/leave_mgmt/add-faculty", authenticateSession, async (req, res) => {
  const { faculty_name, designation, granted_leaves } = req.body;
  if (!faculty_name || !designation) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  try {
    await pool.query(
      `
      INSERT INTO faculty (faculty_name, designation, granted_leaves, remaining_leaves)
      VALUES (?, ?, ?, ?);
    `,
      [faculty_name, designation, granted_leaves, granted_leaves]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add faculty" });
  }
});

// Route: Get faculty suggestions based on input
app.get("/leave_mgmt/faculty-suggestions", async (req, res) => {
  const { search } = req.query;
  try {
    const [rows] = await pool.query(
      `
      SELECT id, faculty_name, designation 
      FROM faculty
      WHERE CONCAT(faculty_name, ' (', designation, ')') LIKE ?
      ORDER BY designation, faculty_name;
    `,
      [`%${search}%`]
    );

    const suggestions = rows.map((faculty) => ({
      id: faculty.id,
      display: `${faculty.faculty_name} (${faculty.designation})`,
    }));

    res.json(suggestions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch faculty suggestions" });
  }
});

// Route: Delete faculty and related records
app.delete(
  "/leave_mgmt/delete-faculty/:id",
  authenticateSession,
  async (req, res) => {
    const { id } = req.params;

    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      // Delete from `leaves` table
      await connection.query("DELETE FROM leaves WHERE faculty_id = ?", [id]);

      // Delete from `faculty` table
      await connection.query("DELETE FROM faculty WHERE id = ?", [id]);

      await connection.commit();
      res.json({
        success: true,
        message: "Faculty and related records deleted successfully.",
      });
    } catch (err) {
      if (connection) await connection.rollback();
      console.error(err);
      res.status(500).json({ error: "Failed to delete faculty." });
    } finally {
      if (connection) connection.release();
    }
  }
);

// Serve leave details page
app.get(
  "/leave_mgmt/leave-details/:id",
  authenticateSession,
  async (req, res) => {
    const { id } = req.params;
    try {
      const [facultyRows] = await pool.query(
        `
        SELECT faculty_name, designation, total_leaves 
        FROM faculty 
        WHERE id = ?
      `,
        [id]
      );

      if (facultyRows.length === 0) {
        res.status(404).send("Faculty not found");
        return;
      }

      // Serve the leave-details.html file
      res.sendFile(path.join(__dirname, "public", "leaveDetails.html"));
    } catch (err) {
      console.error(err);
      res.status(500).send("Error retrieving leave details");
    }
  }
);

// Route to fetch leave details data
app.get(
  "/leave_mgmt/leave-details-data/:id",
  authenticateSession,
  async (req, res) => {
    const { id } = req.params;
    try {
      const [facultyRows] = await pool.query(
        `
        SELECT faculty_name, designation, total_leaves 
        FROM faculty 
        WHERE id = ?
      `,
        [id]
      );

      if (facultyRows.length === 0) {
        return res.status(404).json({ error: "Faculty not found" });
      }

      const faculty = facultyRows[0];

      const [leaveRows] = await pool.query(
        `
        SELECT 
          l.id, 
          l.leave_category, 
          DATE_FORMAT(l.leave_date, '%d-%m-%Y') AS formatted_date,
          ld.half_leave_type, 
          ld.short_leave_from, 
          ld.short_leave_to
        FROM leaves l
        LEFT JOIN leave_details ld ON l.id = ld.leave_id
        WHERE l.faculty_id = ?
        ORDER BY l.leave_date DESC;
        `,
        [id]
      );

      res.json({ faculty, leaves: leaveRows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error retrieving leave details" });
    }
  }
);

// Logout route
app.post("/leave_mgmt/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }
    res.json({ message: "Logout successful" });
  });
});

// Delete leave
app.post(
  "/leave_mgmt/delete-leave/:leaveId",
  authenticateSession,
  async (req, res) => {
    const { leaveId } = req.params;

    let connection;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      // Retrieve leave details for adjustment
      const [leaveDetails] = await connection.query(
        "SELECT leave_category, faculty_id FROM leaves WHERE id = ?",
        [leaveId]
      );

      if (leaveDetails.length === 0) {
        await connection.rollback();
        res.status(404).json({ error: "Leave record not found." });
        return;
      }

      const { leave_category, faculty_id } = leaveDetails[0];

      // Delete from `leaves` table

      const [result] = await connection.query(
        "DELETE FROM leaves WHERE id = ?",
        [leaveId]
      );

      if (result.affectedRows === 0) {
        await connection.rollback();
        res.status(404).json({ error: "Failed to delete leave record." });
        return;
      }

      const [rows] = await connection.query(`
        SELECT COUNT(*) AS leave_count FROM leaves WHERE leave_category = 'short_leaves'`);
      const short_leaves_count = rows[0].leave_count + 1;

      // Adjust total leaves based on leave category
      let adjustment = 0;
      if (leave_category === "short_leaves") {
        adjustment = short_leaves_count % 3 === 0 ? -0.34 : -0.33;
      } else if (leave_category === "half_day_leaves") {
        adjustment = -0.5;
      } else if (leave_category === "casual_leaves") {
        adjustment = -1;
      }

      if (adjustment !== 0) {
        await connection.query(
          "UPDATE faculty SET total_leaves = total_leaves + ?, remaining_leaves = remaining_leaves - ? WHERE id = ?",
          [adjustment, adjustment, faculty_id]
        );
      }

      await connection.commit();
      res.redirect(`/leave_mgmt/leave-details/${faculty_id}`);
    } catch (err) {
      if (connection) await connection.rollback();
      console.error(err);
      res.status(500).json({ error: "Failed to delete leave record." });
    } finally {
      if (connection) connection.release();
    }
  }
);

app.use("/leave_mgmt/pdf", authenticateSession, require("./routes/pdf"));

// Start server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}/leave_mgmt`);
});
