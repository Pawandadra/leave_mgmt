const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const md5 = require('md5');
const path = require("path");
require('dotenv').config();

const port = process.env.PORT;
app.use(bodyParser.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
}).promise();

// Create a session store instance
const sessionStore = new MySQLStore({}, pool);

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    path: '/',
    secure: process.env.NODE_ENV === 'production',  // Set to true if using HTTPS
    httpOnly: true, // Prevent client-side access to cookies
    maxAge: 86400000  // 1 day expiration
  }
}));

app.use('/leave_mgmt/', express.static(path.join(__dirname, 'public')));
app.set('trust proxy', 1);

// Serve login page at /leave_mgmt
app.get('/leave_mgmt/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/leave_mgmt/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Missing username or password' });
  }

  try {
    const hashedPassword = md5(password);
    const [users] = await pool.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, hashedPassword]);

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Store user session data
    req.session.user = {
      id: users[0].id,
      username: users[0].username
    };

    res.json({ message: 'Login successful' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

const authenticateSession = (req, res, next) => {
  console.log('Session Data:', req.session);
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }
  next();
};

const validLeaveCategories = ['half_day_leaves', 'casual_leaves', 'academic_leaves', 'medical_leaves', 'compensatory_leaves', 'other_leaves', 'short_leaves'];

// Serve dashboard after authentication
app.get('/leave_mgmt/dashboard', authenticateSession, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'main.html'));
});

// Route: Get all faculty leave data
app.get('/leave_mgmt/get-leaves', authenticateSession, async (req, res) => {
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
                SUM(CASE WHEN leave_category = 'other_leaves' THEN 1 ELSE 0 END) AS other_leaves,
                faculty.total_leaves
            FROM faculty
            LEFT JOIN leaves ON faculty.id = leaves.faculty_id
            GROUP BY faculty.id
            ORDER BY faculty.id;
        `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch leave data' });
  }
});

// Route: Add leave
app.post('/leave_mgmt/add-leave', authenticateSession, async (req, res) => {
  const { faculty_id, leave_category, leave_date } = req.body;

  if (!validLeaveCategories.includes(leave_category)) {
    return res.status(400).json({ error: 'Invalid leave category' });
  }
  if (!faculty_id || !leave_category || !leave_date) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    if (leave_category === 'short_leaves') {
      // Fetch current leave counts for the faculty
      const [rows] = await connection.query(`
        SELECT 
          SUM(CASE WHEN leave_category = 'short_leaves' THEN 1 ELSE 0 END) AS short_leaves_count,
          SUM(CASE WHEN leave_category = 'casual_leaves' THEN 1 ELSE 0 END) AS casual_leaves_count,
          (SELECT total_leaves FROM faculty WHERE id = ?) AS total_leaves
        FROM leaves
        WHERE faculty_id = ?;
      `, [faculty_id, faculty_id]);

      let { short_leaves_count = 0, total_leaves = 0 } = rows[0];
      short_leaves_count += 1;

      let newTotalLeaves = parseFloat(total_leaves) + 0.33;

      // Convert 3 short leaves to 1 casual leave
      if (short_leaves_count % 3 === 0) {
        await connection.query(`
          DELETE FROM leaves
          WHERE faculty_id = ? AND leave_category = 'short_leaves';
        `, [faculty_id]);

        await connection.query(`
          INSERT INTO leaves (faculty_id, leave_category, leave_date)
          VALUES (?, 'casual_leaves', ?);
        `, [faculty_id, leave_date]);

        newTotalLeaves = parseFloat(total_leaves) + 0.34; // Adjusting to total when reaching 3 short leaves
        short_leaves_count = 0; // Reset short leave count
      } else {
        await connection.query(`
          INSERT INTO leaves (faculty_id, leave_category, leave_date)
          VALUES (?, ?, ?);
        `, [faculty_id, leave_category, leave_date]);
      }

      newTotalLeaves = parseFloat(newTotalLeaves.toFixed(2));

      await connection.query(`
        UPDATE faculty
        SET total_leaves = ?
        WHERE id = ?;
      `, [newTotalLeaves, faculty_id]);

      await connection.commit();
      return res.json({
        status: 'success',
        updatedData: {
          short_leaves: short_leaves_count,
          total_leaves: newTotalLeaves,
        },
      });

    } else if (leave_category === 'half_day_leaves') {
      // Handle half-day leave
      await connection.query(`
        INSERT INTO leaves (faculty_id, leave_category, leave_date)
        VALUES (?, ?, ?);
      `, [faculty_id, leave_category, leave_date]);
    
      await connection.query(`
        UPDATE faculty
        SET total_leaves = total_leaves + 0.5
        WHERE id = ?;
      `, [faculty_id]);
    
      await connection.commit();
      return res.json({ status: 'success' });
    } else {
      // Handle other leave categories
      await connection.query(`
        INSERT INTO leaves (faculty_id, leave_category, leave_date)
        VALUES (?, ?, ?);
      `, [faculty_id, leave_category, leave_date]);

      await connection.query(`
        UPDATE faculty
        SET total_leaves = total_leaves + 1
        WHERE id = ?;
      `, [faculty_id]);

      await connection.commit();
      return res.json({ status: 'success' });
    }
  } catch (err) {
    if (connection) await connection.rollback();
    console.error(err);
    res.status(500).json({ error: 'Failed to add leave' });
  } finally {
    if (connection) connection.release();
  }
});

// Route: Add faculty
app.post('/leave_mgmt/add-faculty', authenticateSession, async (req, res) => {
  const { faculty_name, designation } = req.body;
  if (!faculty_name || !designation) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    await pool.query(`
            INSERT INTO faculty (faculty_name, designation)
            VALUES (?, ?);
        `, [faculty_name, designation]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add faculty' });
  }
});

// Route: Get faculty suggestions based on input
app.get('/leave_mgmt/faculty-suggestions', async (req, res) => {
  const { search } = req.query;
  try {
    const [rows] = await pool.query(`
      SELECT id, faculty_name, designation 
      FROM faculty
      WHERE CONCAT(faculty_name, ' (', designation, ')') LIKE ?
      ORDER BY designation, faculty_name;
    `, [`%${search}%`]);

    const suggestions = rows.map(faculty => ({
      id: faculty.id,
      display: `${faculty.faculty_name} (${faculty.designation})`
    }));

    res.json(suggestions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch faculty suggestions' });
  }
});

// Route: Delete faculty and related records
app.delete('/leave_mgmt/delete-faculty/:id', authenticateSession, async (req, res) => {
  const { id } = req.params;
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Delete from `leaves` table
    await connection.query('DELETE FROM leaves WHERE faculty_id = ?', [id]);

    // Delete from `faculty` table
    await connection.query('DELETE FROM faculty WHERE id = ?', [id]);

    await connection.commit();
    res.json({ success: true, message: 'Faculty and related records deleted successfully.' });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error(err);
    res.status(500).json({ error: 'Failed to delete faculty.' });
  } finally {
    if (connection) connection.release();
  }
});

// Route: Get leave details for a faculty
app.get('/leave_mgmt/leave-details/:id', authenticateSession, async (req, res) => {
  const { id } = req.params;
  try {
    const [facultyRows] = await pool.query(`
          SELECT faculty_name, designation, total_leaves 
          FROM faculty 
          WHERE id = ?
      `, [id]);

    if (facultyRows.length === 0) {
      res.status(404).send('Faculty not found');
      return;
    }

    const faculty = facultyRows[0];

    const [leaveRows] = await pool.query(`
      SELECT leave_category, DATE_FORMAT(leave_date, '%d-%m-%Y') AS formatted_date
      FROM leaves
      WHERE faculty_id = ?
      ORDER BY leave_date DESC;
  `, [id]);

    // Function to format leave category names properly
    function formatLeaveCategory(category) {
      return category
        .replace(/_/g, ' ')  // Replace underscores with spaces
        .replace(/\b\w/g, char => char.toUpperCase())  // Capitalize each word
        .replace(/\bLeaves\b/i, 'Leave');
    }

    let leaveTableRows = leaveRows.map(row =>
      `<tr><td>${formatLeaveCategory(row.leave_category)}</td><td>${row.formatted_date}</td></tr>`
    ).join('');

    if (leaveTableRows.length === 0) {
      leaveTableRows = '<tr><td colspan="2" style="text-align:center;">No leave records found</td></tr>';
    }

    res.send(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Leave Details</title>
              <style>
                  table { width: 50%; border-collapse: collapse; margin: 20px auto; }
                  th, td { border: 1px solid black; padding: 8px; text-align: left; }
                  th { background-color: #f2f2f2; }
                  h2, .total { text-align: center; }
                  .back-btn { display: block; text-align: center; margin-top: 20px; }
              </style>
          </head>
          <body>
              <h2>Leave Details for ${faculty.faculty_name} (${faculty.designation})</h2>
              <table>
                  <tr><th>Leave Category</th><th>Date</th></tr>
                  ${leaveTableRows}
              </table>
              <h3 class="total">Total Leaves: ${faculty.total_leaves}</h3>
              <a class="back-btn" href="/leave_mgmt/dashboard">Back to Dashboard</a>
          </body>
          </html>
      `);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving leave details');
  }
});

app.post('/leave_mgmt/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logout successful' });
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on https://localhost:${port}/leave_mgmt`)
});
