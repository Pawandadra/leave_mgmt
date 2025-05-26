# Faculty Leave Management System

## Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Technologies Used](#technologies-used)
- [System Requirements](#system-requirements)
- [Installation Guide](#installation-guide)
- [Configuration](#configuration)
- [Database Schema](#database-schema)
- [Usage](#usage)
- [Deployment](#deployment)
- [Security Considerations](#security-considerations)

---

## Overview
The **Faculty Leave Management System** is a web-based application designed to manage faculty leaves efficiently. It allows authorized user to add faculties, add leaves, view their leave details, and track total leave balances. The system features a secure login mechanism and is designed to be deployed on a server using Nginx.

---

## Features
- **User Authentication:**
  - Secure password hashing
  - Session-based authentication
  - Restricted access until login
  
- **Leave Management:**
  - Authorized user can make entry for different types of leaves for different faculties
  - Leaves stored in a dedicated table for detailed tracking
  - Short leaves count as 1/3 of casual leave, and 3 short leaves are converted to 1 casual leave

- **Designation Management:**
  - Faculty name and designation input via dropdown with predefined values
  
- **Detailed Leave Tracking:**
  - Leave details (category & date) are stored separately and displayed dynamically
  - API endpoint to fetch leave details

- **User Interface:**
  - Dashboard after login at `/leave_mgmt/dashboard`
  - Details page displaying faculty leave data
  
---

## Technologies Used
- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js (Express.js framework)
- **Database:** MySQL
- **Web Server:** Nginx

---

## System Requirements
- Server
- Node.js (v14 or higher)
- MySQL (v8 or higher)
- Nginx (latest stable version)

---

## Installation Guide

### 1. Clone the repository
```bash
git clone https://github.com/your-repo/faculty-leave-management.git
cd leave-mgmt
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure the database
Create a MySQL database and import the provided schema.

```sql
CREATE DATABASE leave_management;
USE leave_management;

-- Import the schema from the provided SQL file
SOURCE /path/to/schema.sql;
```

### 4. Update environment variables
Create a `.env` file in the root directory and configure it:

```env
DB_HOST=localhost
DB_USER=db_user
DB_PASSWORD=your_password
DB_NAME=leave_management
SESSION_SECRET=your_secret_key
```

### 5. Start the server
```bash
node server.js
```

The server should now be running at `http://localhost:3300/leave_mgmt`.

---

## Configuration

### Nginx Setup
To deploy the application using Nginx, add the following configuration to `/etc/nginx/sites-available/leave_mgmt`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location /leave_mgmt/ {
        proxy_pass http://localhost:3300/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Enable the configuration and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/leave_mgmt /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

---

## Database Schema

### Faculty Table
```sql
CREATE TABLE faculty (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    designation VARCHAR(100) NOT NULL,
    total_leaves INT DEFAULT 0
);
```

### Leave Details Table
```sql
CREATE TABLE leaves (
    id INT AUTO_INCREMENT PRIMARY KEY,
    faculty_id INT,
    leave_category VARCHAR(50),
    leave_date DATE,
    FOREIGN KEY (faculty_id) REFERENCES faculty(id)
);
```

---

## Usage

### 1. Login to the system
Visit `http://localhost:3300/leave_mgmt` and log in with your credentials.

### 2. Navigate to the dashboard
After successful login, you will be redirected to `/leave_mgmt/dashboard`.

### 3. View leave details
Click on the 'Details' button to open a new tab displaying leave details in a table format.

---

## Deployment
To deploy on a Linux server:

1. Install Node.js, MySQL, and Nginx.
2. Clone the project and configure `.env` file.
3. Set up Nginx reverse proxy.
4. Use `pm2` for process management:

```bash
npm install -g pm2
pm2 start server.js --name leave_mgmt
pm2 save
pm2 startup
```

---

## Security Considerations
- Ensure strong passwords for MySQL and web login.
- Use HTTPS in production.
- Regularly back up the database.
- Restrict MySQL access to authorized IPs only.

---

---

**Maintainers:**
- Project Owner: Pawan Kumar [pawankumarpk3610@gmail.com](mailto:pawankumarpk3610@gmail.com)
- Contributors :
  1. Ankur Paul [ankurpaul27@proton.me](mailto:ankurpaul27@proton.me)
  2. Arsh [arshanand0527@gmail.com](mailto:arshanand0527@gmail.com)
