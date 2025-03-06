document.addEventListener("DOMContentLoaded", () => {
  if (localStorage.getItem("ROLE") === "admin")
    document.querySelector(".dropdown").style.display = "block";

  const updateUsers = async () => {
    const res = await fetch("/leave_mgmt/all-users");

    if (!res.ok) {
      console.log("Error fetching users.");
      return;
    }

    const data = await res.json();
    console.log(data);
    const dropdownMenu = document.querySelector(".dropdown-menu");
    dropdownMenu.innerHTML = ""; // Clear previous users

    data.forEach((user) => {
      dropdownMenu.insertAdjacentHTML(
        "beforeend",
        `<li>
          <span class="username">${user.username}</span>
          <span class="delete-btn" data-username="${user.username}">🗑️</span>
        </li>`
      );
    });

    // Add "Add User" option
    dropdownMenu.insertAdjacentHTML(
      "beforeend",
      `<li class="add-user-option">➕ Add User</li>`
    );

    // Hide dropdown when clicking outside
    const dropdown = document.querySelector(".dropdown");

    document.addEventListener("click", (event) => {
      if (!dropdown.contains(event.target)) {
        dropdownMenu.classList.remove("active"); // Hide dropdown
      }
    });

    // Add event listeners
    document.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const username = e.target.dataset.username;
        deleteUser(username);
      });
    });

    document.querySelector(".add-user-option").addEventListener("click", () => {
      showAddUserForm();
    });
  };

  // Toggle dropdown menu
  document.querySelector(".dropdown-toggle").addEventListener("click", () => {
    document.querySelector(".dropdown-menu").classList.toggle("active");
  });

  // Show Add User Form
  const showAddUserForm = () => {
    document.querySelector(".form-container").innerHTML = `
      <div class="add-user-form">
        <input type="text" id="new-username" placeholder="Username" required />
        <input type="password" id="new-password" placeholder="Password" required />
        <div class="add-user-form-btns">
         <button id="submit-user">Add</button> <button id="cancel-user">Cancel</button>
        </div>
       
      </div>
    `;

    document
      .querySelector("#submit-user")
      .addEventListener("click", async () => {
        const username = document.querySelector("#new-username").value.trim();
        const password = document.querySelector("#new-password").value.trim();

        if (!username || !password) {
          alert("Please fill all fields!");
          return;
        }

        const res = await fetch("/leave_mgmt/add-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });

        const data = await res.json();
        if (res.ok) {
          alert("User added!");
          document.querySelector(".add-user-form").remove();
          updateUsers(); // Refresh list
        } else {
          alert(data.error);
        }
      });

    document.querySelector("#cancel-user").addEventListener("click", () => {
      document.querySelector(".add-user-form").remove();
    });
  };

  // Delete User Function
  const deleteUser = async (username) => {
    if (!confirm(`Delete ${username}?`)) return;

    const res = await fetch(`/leave_mgmt/delete-user/${username}`, {
      method: "DELETE",
    });

    if (res.ok) {
      alert("User deleted!");
      updateUsers(); // Refresh list
    } else {
      alert("Error deleting user!");
    }
  };

  // Initial call to load users
  if (localStorage.getItem("ROLE") === "admin") updateUsers();

  const designationPriority = {
    Professor: 1,
    "Associate Professor": 2,
    "Assistant Professor": 3,
    Clerk: 4,
    "Lab Technician": 5,
    "Lab Attendant": 6,
    Attendant: 7,
  };

  // Function to remove prefixes from faculty names
  function removePrefixes(name) {
    return name
      .replace(/^(Er\.|Dr\.|Mr\.|Ms\.|Prof\.|S\.|Er|Dr|Mr|Ms|Prof|S)\s*/i, "")
      .trim();
  }

  // Function to load table data
  function loadTableData() {
    // API call to fetch all faculty leave data
    fetch("/leave_mgmt/get-leaves")
      .then((response) => response.json())
      .then((responseData) => {
        if (!Array.isArray(responseData)) {
          showError("Invalid data format received.");
          console.error(responseData);
          return;
        }

        // Sort data by designation priority
        responseData.sort((a, b) => {
          const designationComparison =
            designationPriority[a.designation] -
            designationPriority[b.designation];
          if (designationComparison === 0) {
            return removePrefixes(a.faculty_name).localeCompare(
              removePrefixes(b.faculty_name)
            );
          }
          return designationComparison;
        });

        const tbody = document.getElementById("leave-table"); // Table body reference
        tbody.innerHTML = ""; // Clear table content
        responseData.forEach((row, index) => {
          tbody.innerHTML += generateRowHTML(row, index + 1); // Pass serial number as index + 1
        });
      })
      .catch((error) => showError("Error fetching data: " + error.message));
  }

  // Function to generate row HTML for each faculty
  function generateRowHTML(row, serialNumber) {
    // console.log(row);

    return `
              <tr data-id="${row.id}">
                  <td>${serialNumber}</td>
                  <td>${row.faculty_name}</td>
                  <td>${row.designation}</td>
                  <td>${row.short_leaves || 0}</td>
                  <td>${row.half_day_leaves || 0}</td>
                  <td>${row.casual_leaves || 0}</td>
                  <td>${row.academic_leaves || 0}</td>
                  <td>${row.medical_leaves || 0}</td>
                  <td>${row.compensatory_leaves || 0}</td>
                  <td>${row.earned_leaves || 0}</td>
                  <td>${row.without_payment_leaves || 0}</td>
                  <td>${row.remaining_leaves || 0}</td>
                  <td>${row.granted_leaves || 0}</td>
                  <td>${parseFloat(row.total_leaves).toFixed(2)}</td>
                  <td>
                      <button class="add-leave-button">Add Leave</button>
                      <button class="details-button" data-id="${
                        row.id
                      }">Details</button>
                  </td>
              </tr>
              <tr class="leave-options-row" style="display: none;">
                  <td colspan="15">
                      <div class="addLeaveOptions">
                          <div class="category nameofCategory">
                              <label class="insidelabel">Category:</label>
                              <select class="leave-category">
                                  <option value="" disabled selected>Select Leave Category</option>
                                  <option value="short_leaves">Short Leave</option>
                                  <option value="half_day_leaves">Half Day Leave</option>
                                  <option value="casual_leaves">Full Day Leave</option>
                                  <option value="academic_leaves">Academic Leave</option>
                                  <option value="medical_leaves">Medical/Maternity Leave</option>
                                  <option value="compensatory_leaves">Compensatory Leave</option>
                                  <option value="earned_leaves">Earned Leave</option>
                                  <option value="without_payment_leaves">Without Payment Leave</option>
                                  <option value="granted_leaves">Granted Leaves</option>
                              </select>
                              <div class="dynamic-option"></div>
                          </div>
                         
                          <button class="update-leave-button updateBtn">Update</button>
                      </div>
                  </td>
              </tr>`;
  }

  // Event listener for handling table actions
  document.getElementById("leave-table").addEventListener("click", (e) => {
    const button = e.target;

    // Toggle leave options row
    if (button.classList.contains("add-leave-button")) {
      const currentRow = button.closest("tr");
      const optionsRow = currentRow.nextElementSibling;
      optionsRow.style.display =
        optionsRow.style.display === "none" ? "" : "none";
      const options = optionsRow.querySelector(".leave-category");

      const dynamicOption = optionsRow.querySelector(".dynamic-option");
      options.addEventListener("change", function (e) {
        const leaveType = e.target.value;
        if (leaveType === "half_day_leaves") {
          const html = `<span>Type: </span>
            <select class="half-day-leave-select">
              <option value="" selected disabled>Select</option>
              <option value="before_noon">Before Noon</option>
              <option value="after_noon">After Noon</option>
            </select>
            <div class="dynamic-date">
                <label class="dynamic-label">Date:</label>
                <input type="date" class="add-leave-date single-leave-date" value="${
                  new Date().toISOString().split("T")[0]
                }">
            </div">`;
          dynamicOption.innerHTML = html;
        } else if (leaveType === "short_leaves") {
          const html = `<span class="shortleaveTime">Time: </span>
            <div class="inputs--time">
              <label shortleavefrom>From: </label>
              <input class="time-picker input--from-time" min type="time"></input>
              <label shortleaveto>To: </label>
              <input class="time-picker input--to-time" type="time"></input>
            </div>
            <div class="dynamic-date">
                <label class="dynamic-label">Date:</label>
                <input type="date" class="add-leave-date single-leave-date" value="${
                  new Date().toISOString().split("T")[0]
                }">
            </div">`;

          dynamicOption.innerHTML = html;
          // dynamicOption.querySelectorAll(".time-picker").forEach((tp) =>
          //   tp.addEventListener("click", function () {
          //     this.showPicker();
          //   })
          // );
        } else if (leaveType === "granted_leaves") {
          // const currentRemainingLeaves = currentRow.querySelector(
          //   ".td--remaining-leaves"
          // ).textContent;
          html = `<span>Value:</span>
                <input type="number" class="input--granted-leaves"></input>`;
          dynamicOption.innerHTML = html;
        } else {
          dynamicOption.innerHTML = `<div class="dynamic-date">
                <label class="dynamic-label">From:</label>
                <input type="date" class="add-leave-date leave--from-date" value="${
                  new Date().toISOString().split("T")[0]
                }">
            </div"> <div class="dynamic-date">
                <label class="dynamic-label">To:</label>
                <input type="date" class="add-leave-date leave--to-date" value="${
                  new Date().toISOString().split("T")[0]
                }">
            </div">`;
        }
      });
    }

    // Open details page
    if (button.classList.contains("details-button")) {
      const facultyId = button.dataset.id;
      window.location.href = `/leave_mgmt/leave-details/${facultyId}`; // Redirect to details page
    }

    // Update leave record
    if (button.classList.contains("update-leave-button")) {
      const optionsRow = button.closest(".leave-options-row");
      const mainRow = optionsRow.previousElementSibling;
      const facultyId = mainRow.dataset.id;

      const dynamicOption = optionsRow.querySelector(".dynamic-option");
      const secLeaveOption = dynamicOption.querySelector(
        ".half-day-leave-select"
      )?.value ||
        dynamicOption.querySelector(".input--granted-leaves")?.value || {
          fromTime: dynamicOption
            .querySelector(".inputs--time")
            ?.querySelector(".input--from-time")?.value,
          toTime: dynamicOption
            .querySelector(".inputs--time")
            ?.querySelector(".input--to-time")?.value,
        };
      const category = [
        optionsRow.querySelector(".leave-category").value,
        secLeaveOption,
      ];

      const date = optionsRow.querySelector(".single-leave-date")?.value || [
        optionsRow.querySelector(".leave--from-date")?.value,
        optionsRow.querySelector(".leave--to-date")?.value,
      ];

      updateLeave(facultyId, category, date, mainRow, optionsRow);
    }
  });
  // Logout button event listener
  document.getElementById("logout-button").addEventListener("click", () => {
    fetch("/leave_mgmt/logout", {
      method: "POST",
      credentials: "include", // Ensures session cookies are sent with the request
      headers: { "Content-Type": "application/json" },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Logout failed");
        }
        return response.json();
      })
      .then((data) => {
        alert(data.message); // Show logout success message
        window.location.href = "/leave_mgmt"; // Redirect to login page
      })
      .catch((error) => {
        console.error("Logout error:", error);
        alert("Logout failed. Please try again.");
      });
  });
  // Function to update leave details
  function updateLeave(
    facultyId,
    category,
    date,
    row,
    optionsRow,
    secLeaveOption = null
  ) {
    if (!confirm("Are you sure you want to add the leave?")) return;

    fetch("/leave_mgmt/add-leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        faculty_id: facultyId,
        leave_categoryArr: category,
        leave_date: date,
      }),
    })
      .then((response) => {
        if (!response.ok) {
          return response.json().then((errorData) => {
            throw new Error(errorData.error || "Unknown error occurred");
          });
        }
        return response.json();
      })
      .then(() => {
        showSuccess("Leave added successfully!");
        loadTableData(); // Reload table data to reflect changes
        optionsRow.style.display = "none";
      })
      .catch((error) => {
        console.log(error.message);

        return showError("Failed to add leave: " + error.message);
      });
  }

  // Function to display error messages
  function showError(message) {
    const errorDiv = document.getElementById("error-message");
    errorDiv.innerText = message;
    errorDiv.style.display = "block";
    errorDiv.style.color = "red";
    setTimeout(() => {
      errorDiv.style.display = "none";
    }, 3000);
  }

  // Function to display success messages
  function showSuccess(message) {
    const successDiv = document.getElementById("success-message");
    successDiv.innerText = message;
    successDiv.style.display = "block";
    successDiv.style.color = "#155724";
    setTimeout(() => {
      successDiv.style.display = "none";
    }, 3000);
  }

  // Initial data load
  loadTableData();

  // Add faculty functionality
  document
    .getElementById("add-faculty-button")
    .addEventListener("click", () => {
      const facultyName = document
        .getElementById("new-faculty-name")
        .value.trim();
      const facultyDesignation = document.getElementById(
        "new-faculty-designation"
      ).value;
      const grantedLeaves = document.querySelector(
        ".input--granted-leaves"
      ).value;

      if (!facultyName || !facultyDesignation) {
        showError("Please enter a faculty name and select a designation.");
        return;
      }
      if (!grantedLeaves) return showError("Please enter Granted Leaves.");
      if (!confirm("Are you sure you want to add faculty?")) return;

      fetch("/leave_mgmt/add-faculty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          faculty_name: facultyName,
          designation: facultyDesignation,
          granted_leaves: grantedLeaves,
        }),
      })
        .then(() => {
          showSuccess("Faculty added successfully!");
          document.getElementById("new-faculty-name").value = "";
          document.getElementById("new-faculty-designation").selectedIndex = 0;
          document.getElementById("grantedLeaves").value = "";
          loadTableData(); // Refresh table
        })
        .catch((error) => showError("Failed to add faculty: " + error.message));
    });
  const searchInput = document.getElementById("searchInput");
  const deleteBtn = document.getElementById("delete-faculty-btn");
  const suggestionsList = document.getElementById("suggestionsBox");

  let selectedFacultyId = null;
  let activeIndex = -1;
  let suggestions = [];

  // Fetch suggestions as user types
  searchInput.addEventListener("input", async () => {
    const searchQuery = searchInput.value.trim();
    if (searchQuery.length === 0) {
      suggestionsList.innerHTML = "";
      suggestionsList.style.display = "none";
      deleteBtn.disabled = true;
      selectedFacultyId = null;
      return;
    }

    try {
      const response = await fetch(
        `/leave_mgmt/faculty-suggestions?search=${searchQuery}`
      );
      suggestions = await response.json(); // Store the suggestions in an array

      if (suggestions.length === 0) {
        suggestionsList.innerHTML = "";
        suggestionsList.style.display = "none";
        return;
      }

      activeIndex = 0;

      // Generate suggestions and position them above the input
      suggestionsList.innerHTML = suggestions
        .map(
          (suggestion, index) =>
            `<li data-id="${suggestion.id}" class="suggestion-item ${
              index === activeIndex ? "active" : ""
            }" style="cursor: pointer;">${suggestion.display}</li>`
        )
        .join("");

      suggestionsList.style.display = "block";
      setTimeout(positionSuggestions, 0); // Ensure height is updated before positioning

      // Add click event for each suggestion
      Array.from(suggestionsList.children).forEach((item, index) => {
        item.addEventListener("click", () => selectSuggestion(index));
      });

      activeIndex = -1; // Reset active index for keyboard navigation
    } catch (err) {
      console.error("Error fetching suggestions:", err);
    }
  });

  // Function to handle arrow key navigation
  searchInput.addEventListener("keydown", (e) => {
    const items = suggestionsList.querySelectorAll(".suggestion-item");

    if (e.key === "ArrowDown") {
      activeIndex = (activeIndex + 1) % items.length;
    } else if (e.key === "ArrowUp") {
      activeIndex = (activeIndex - 1 + items.length) % items.length;
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && items[activeIndex]) {
        selectSuggestion(activeIndex);
      }
    }

    // Update active item class
    items.forEach((item, index) => {
      item.classList.toggle("active", index === activeIndex);
      if (index === activeIndex) {
        item.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });
  });

  // Function to select a suggestion
  function selectSuggestion(index) {
    if (suggestions[index]) {
      searchInput.value = suggestions[index].display;
      selectedFacultyId = suggestions[index].id;
      deleteBtn.disabled = false;
      suggestionsList.innerHTML = "";
      suggestionsList.style.display = "none";
    }
  }

  // Position suggestions box dynamically
  function positionSuggestions() {
    const rect = searchInput.getBoundingClientRect();
    suggestionsList.style.bottom = `100%`; // Places it above the input
    suggestionsList.style.left = `0`; // Aligns with input
    suggestionsList.style.width = `${rect.width}px`; // Matches input width
  }

  // Hide suggestions when clicking outside
  document.addEventListener("click", (e) => {
    if (
      !searchInput.contains(e.target) &&
      !suggestionsList.contains(e.target)
    ) {
      suggestionsList.style.display = "none";
    }
  });

  // Delete faculty
  deleteBtn.addEventListener("click", async () => {
    if (!selectedFacultyId) return;

    const confirmation = confirm(
      "Are you sure you want to delete this faculty and all their records?"
    );
    if (!confirmation) return;

    try {
      const response = await fetch(
        `/leave_mgmt/delete-faculty/${selectedFacultyId}`,
        { method: "DELETE" }
      );
      const result = await response.json();

      if (result.success) {
        alert("Faculty deleted successfully.");
        searchInput.value = "";
        loadTableData();
        deleteBtn.disabled = true;
        selectedFacultyId = null;
      } else {
        alert(result.error || "Failed to delete faculty.");
      }
    } catch (err) {
      console.error("Error deleting faculty:", err);
      alert("An error occurred while deleting the faculty.");
    }
  });
});

document
  .querySelector(".generate-report")
  .addEventListener("click", async (e) => {
    e.preventDefault();
    const fromDate = document.querySelector(".from-date").value;
    const toDate = document.querySelector(".to-date").value;
    const res = await fetch(
      `/leave_mgmt/pdf/all?fromDate=${fromDate}&toDate=${toDate}`,
      {
        method: "GET",
      }
    );

    if (!res.ok) console.log("failed to fetch pdf");

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank");
  });

const today = new Date();
today.setDate(today.getDate() - 35);
document.querySelector(".from-date").value = today.toISOString().split("T")[0];
document.querySelector(".to-date").value = new Date()
  .toISOString()
  .split("T")[0];

document.querySelector(".heading--department-name").textContent =
  "Department of " + localStorage.getItem("departmentName");

document
  .querySelector(".btn--todays-report")
  .addEventListener("click", async (e) => {
    e.preventDefault();
    // console.log("Todays report requested...");
    const res = await fetch(`/leave_mgmt/pdf/todays-report`);

    if (!res.ok) {
      console.error("Failed to fetch pdf.");
      const error = await res.json();
      return alert(error.error);
    }

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank");
  });
