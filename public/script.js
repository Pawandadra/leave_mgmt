document.addEventListener('DOMContentLoaded', () => {

    // Function to load table data
    function loadTableData() {  // API call to fetch all faculty leave data
        fetch('/leave_mgmt/get-leaves')
            .then(response => response.json())
            .then(responseData => {
                if (!Array.isArray(responseData)) {
                    showError('Invalid data format received.');
                    console.error(responseData);
                    return;
                }
                const tbody = document.getElementById('leave-table'); // Table body reference
                tbody.innerHTML = ''; // Clear table content
                responseData.forEach(row => {
                    tbody.innerHTML += generateRowHTML(row); // Add rows dynamically
                });
            })
            .catch(error => showError('Error fetching data: ' + error.message));
    }

    // Function to generate row HTML for each faculty
    function generateRowHTML(row) {
        return `
            <tr data-id="${row.id}">
                <td>${row.id}</td>
                <td>${row.faculty_name}</td>
                <td>${row.designation}</td>
                <td>${row.short_leaves || 0}</td>
                <td>${row.casual_leaves || 0}</td>
                <td>${row.academic_leaves || 0}</td>
                <td>${row.medical_leaves || 0}</td>
                <td>${row.compensatory_leaves || 0}</td>
                <td>${row.other_leaves || 0}</td>
                <td>${parseFloat(row.total_leaves).toFixed(2)}</td>
                <td>
                    <button class="add-leave-button">Add Leave</button>
                    <button class="details-button" data-id="${row.id}">Details</button>
                </td>
            </tr>
            <tr class="leave-options-row" style="display: none;">
                <td colspan="10">
                    <label>Category:</label>
                    <select class="leave-category">
                        <option value="" disabled selected>Select Leave Category</option>
                        <option value="short_leaves">Short Leave</option>
                        <option value="casual_leaves">Casual Leave</option>
                        <option value="academic_leaves">Academic Leave</option>
                        <option value="medical_leaves">Medical Leave</option>
                        <option value="compensatory_leaves">Compensatory Leave</option>
                        <option value="other_leaves">Other Leave</option>
                    </select>
                    <label>Date:</label>
                    <input type="date" class="leave-date" value="${new Date().toISOString().split('T')[0]}">
                    <button class="update-leave-button">Update</button>
                </td>
            </tr>`;
    }

    // Event listener for handling table actions
    document.getElementById('leave-table').addEventListener('click', (e) => {
        const button = e.target;

        // Toggle leave options row
        if (button.classList.contains('add-leave-button')) {
            const currentRow = button.closest('tr');
            const optionsRow = currentRow.nextElementSibling;
            optionsRow.style.display = optionsRow.style.display === 'none' ? '' : 'none';
        }

        // Open details page
        if (button.classList.contains('details-button')) {
            const facultyId = button.dataset.id;
            window.open(`/leave_mgmt/leave-details/${facultyId}`); // Redirect to details page
        }

        // Update leave record
        if (button.classList.contains('update-leave-button')) {
            const optionsRow = button.closest('.leave-options-row');
            const mainRow = optionsRow.previousElementSibling;
            const facultyId = mainRow.dataset.id;
            const category = optionsRow.querySelector('.leave-category').value;
            const date = optionsRow.querySelector('.leave-date').value;

            updateLeave(facultyId, category, date, mainRow, optionsRow);
        }
    });

    // Logout button event listener
    document.getElementById('logout-button').addEventListener('click', () => {
        fetch('/leave_mgmt/logout', {
            method: 'POST',
            credentials: 'include',  // Ensures session cookies are sent with the request
            headers: { 'Content-Type': 'application/json' }
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Logout failed');
                }
                return response.json();
            })
            .then(data => {
                alert(data.message);  // Show logout success message
                window.location.href = '/leave_mgmt';  // Redirect to login page
            })
            .catch(error => {
                console.error('Logout error:', error);
                alert('Logout failed. Please try again.');
            });
    });

    // Function to update leave details
    function updateLeave(facultyId, category, date, row, optionsRow) {

        if (!confirm('Are you sure you want to add the leave?')) return;

        fetch('/leave_mgmt/add-leave', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ faculty_id: facultyId, leave_category: category, leave_date: date }),
        })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(errorData => {
                        throw new Error(errorData.error || 'Unknown error occurred');
                    });
                }
                return response.json();
            })
            .then(() => {
                showSuccess('Leave added successfully!');
                loadTableData(); // Reload table data to reflect changes
                optionsRow.style.display = 'none';
            })
            .catch(error => showError('Failed to add leave: ' + error.message));
    }

    // Function to display error messages
    function showError(message) {
        const errorDiv = document.getElementById('error-message');
        errorDiv.innerText = message;
        errorDiv.style.display = 'block';
        setTimeout(() => { errorDiv.style.display = 'none'; }, 3000);
    }

    // Function to display success messages
    function showSuccess(message) {
        const successDiv = document.getElementById('success-message');
        successDiv.innerText = message;
        successDiv.style.display = 'block';
        setTimeout(() => { successDiv.style.display = 'none'; }, 3000);
    }

    // Initial data load
    loadTableData();

    // Add faculty functionality
    document.getElementById('add-faculty-button').addEventListener('click', () => {
        const facultyName = document.getElementById('new-faculty-name').value.trim();
        const facultyDesignation = document.getElementById('new-faculty-designation').value;

        if (!facultyName || !facultyDesignation) {
            showError('Please enter a faculty name and select a designation.');
            return;
        }

        if (!confirm('Are you sure you want to add faculty?')) return;

        fetch('/leave_mgmt/add-faculty', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ faculty_name: facultyName, designation: facultyDesignation }),
        })
            .then(() => {
                showSuccess('Faculty added successfully!');
                document.getElementById('new-faculty-name').value = '';
                document.getElementById('new-faculty-designation').selectedIndex = 0;
                loadTableData(); // Refresh table
            })
            .catch(error => showError('Failed to add faculty: ' + error.message));
    });
});
