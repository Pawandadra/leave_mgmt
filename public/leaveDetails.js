// Fetch faculty details and leave data from the server
async function loadLeaveDetails() {
  const facultyId = window.location.pathname.split("/").pop();
  try {
    const response = await fetch(`/leave_mgmt/leave-details-data/${facultyId}`);
    const data = await response.json();

    if (!data.faculty || !data.leaves) {
      throw new Error("Invalid data received from the server.");
    }

    // Populate faculty details
    document.getElementById("faculty-name").textContent =
      data.faculty.faculty_name;
    document.getElementById("faculty-designation").textContent =
      data.faculty.designation;
    document.getElementById("total-leaves").textContent =
      data.faculty.total_leaves;

    // Populate leave table
    const leaveTable = document.getElementById("leave-table");
    leaveTable.innerHTML = data.leaves
      .map(
        (leave) => `
              <tr >
                <td>${leave.leave_category
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (char) => char.toUpperCase())
                  .replace(/\bCasual Leaves\b/i, "Full Day Leave")} 
                  ${
                    ((leave.short_leave_from || leave.half_leave_type) &&
                      `(${
                        leave.half_leave_type
                          ?.replace(/_/g, " ")
                          .replace(/\b\w/g, (char) => char.toUpperCase()) ||
                        leave.short_leave_from + " to " + leave.short_leave_to
                      })`) ||
                    ""
                  }</td>
                <td>${leave.formatted_date}</td>
                <td  class="action-cell">${`<button data-id="${leave.id}" class="btn--delete-leave">Delete</button>`}</td>
              </tr>
            `
      )
      .join("");

    const countCategories = data.leaves.reduce((acc, curr) => {
      if (acc[curr.leave_category]) {
        acc[curr.leave_category] += 1;
      } else {
        acc[curr.leave_category] = 1;
      }

      return acc;
    }, {});
    // const summary = document.querySelector(".summary");
    // const summaryHtml = Object.entries(countCategories)
    //   .map(([key, value]) => {
    //     return `<h3>
    //     ${key
    //       .replace(/_/g, " ")
    //       .replace(/\b\w/g, (char) => char.toUpperCase())}: ${value}
    //       </h3>`;
    //   })
    //   .join("");

    // summary.innerHTML = summaryHtml;

    if (data.leaves.length === 0) {
      leaveTable.innerHTML =
        '<tr><td colspan="2" style="text-align:center;">No leave records found</td></tr>';
    }
  } catch (err) {
    console.error("Error loading leave details:", err);
    alert("Failed to load leave details. Please try again.");
  }
}

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

const messageBox = document.querySelector(".message-box");
const message = document.querySelector(".message");

// Generate PDF report
document.querySelector("#report").addEventListener("click", async (e) => {
  e.preventDefault();
  try {
    const facultyId = window.location.pathname.split("/").pop();
    const fromDate = document.querySelector(".from-date").value;
    const toDate = document.querySelector(".to-date").value;

    const res = await fetch(
      `/leave_mgmt/pdf?facultyId=${facultyId}&fromDate=${fromDate}&toDate=${toDate}`,
      {
        method: "GET",
      }
    );

    if (!res.ok) {
      console.log((await res.json()).error);
      console.log("Failed to create PDF.");
      return;
    }

    const blob = await res.blob();
    const blobUrl = await URL.createObjectURL(blob);
    window.open(blobUrl, "_blank");
  } catch (err) {
    console.err(err);
  }
});

const today = new Date();
today.setDate(today.getDate() - 35);

document.querySelector(".from-date").value = today.toISOString().split("T")[0];
document.querySelector(".to-date").value = new Date()
  .toISOString()
  .split("T")[0];

// Load leave details when the page loads
loadLeaveDetails();

document
  .getElementById("leave-table")
  .addEventListener("click", async function (e) {
    if (e.target.classList.contains("btn--delete-leave")) {
      e.preventDefault();
      const leaveId = e.target.dataset.id;

      try {
        const confirmed = confirm(
          "This action will permanently delete the leave."
        );
        if (!confirmed) return;

        const res = await fetch(`/leave_mgmt/delete-leave/${leaveId}`, {
          method: "POST",
        });

        if (!res.ok) {
          throw new Error("Failed to delete leave record.");
        }

        alert("Leave record deleted successfully!");
        loadLeaveDetails(); // Reload the data to update the table
      } catch (err) {
        console.error("Error deleting leave:", err);
        alert("Failed to delete leave. Please try again.");
      }
    }
  });
