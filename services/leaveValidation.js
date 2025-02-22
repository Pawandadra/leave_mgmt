const { parse, format } = require("date-fns");
const { inSeconds } = require("./helpers");

const NOON_TIME_SECONDS = 12.5 * 3600;

// Leave type enums
const LEAVE_TYPES = {
  HALF_DAY: "half_day_leaves",
  SHORT: "short_leaves",
  GRANTED: "granted_leaves",
};

const organizeLeavesByDate = (allExistingLeaves) => {
  const leaveRecords = {};
  allExistingLeaves.forEach((leave) => {
    const parsedDate = parse(leave.formatted_date, "dd-MM-yyyy", new Date());
    const date = format(parsedDate, "yyyy-MM-dd");
    if (!leaveRecords[date]) leaveRecords[date] = [];
    leaveRecords[date].push(leave);
  });
  return leaveRecords;
};

/**
 * Checks if there are any full day leaves
 * @param {Array} existingLeaves - Array of leaves for a specific date
 * @returns {boolean}
 */
const hasFullDayLeaves = (existingLeaves) => {
  return existingLeaves.some(
    (leave) =>
      leave.leave_category !== LEAVE_TYPES.HALF_DAY &&
      leave.leave_category !== LEAVE_TYPES.SHORT
  );
};

/**
 * Validates half day leave conflicts
 * @param {Array} halfDayLeaves - Array of half day leaves
 * @param {Object} connection - Database connection
 * @param {string} secLeaveOption - Leave option (before_noon/after_noon)
 * @param {string} leave_category - Category of leave being requested
 * @returns {Object|null} Error object if validation fails, null otherwise
 */
const validateHalfDayLeaves = async (
  halfDayLeaves,
  connection,
  secLeaveOption,
  leave_category
) => {
  if (halfDayLeaves.length === 0) return null;

  const [halfDayDetails] = await connection.query(
    `SELECT leave_id, half_leave_type FROM leave_details WHERE leave_id IN (?)`,
    [halfDayLeaves.map((leave) => leave.id)]
  );

  for (const leave of halfDayDetails) {
    // Check for duplicate half-day leave requests
    if (leave.half_leave_type === secLeaveOption) {
      return {
        status: 400,
        error: "Failed to add leave. The requested leave already exists.",
      };
    }

    // Validate short leaves
    if (leave_category === LEAVE_TYPES.SHORT) {
      if (!secLeaveOption.fromTime || !secLeaveOption.toTime) {
        return {
          status: 400,
          error: "Bad Request: Invalid Time",
        };
      }

      const fromTimeInSeconds = inSeconds(secLeaveOption.fromTime);
      const toTimeInSeconds = inSeconds(secLeaveOption.toTime);

      if (
        (leave.half_leave_type === "before_noon" &&
          fromTimeInSeconds <= NOON_TIME_SECONDS) ||
        (leave.half_leave_type === "after_noon" &&
          toTimeInSeconds >= NOON_TIME_SECONDS)
      ) {
        return {
          status: 400,
          error:
            "A half-day leave overlaps with the request. Modify or delete the existing leave first.",
        };
      }
    } else {
      return {
        status: 400,
        error: `A half-day leave already exist for the requested date. Please delete that first.`,
      };
    }
  }

  return null;
};

/**
 * Validates short leave conflicts
 * @param {Array} shortLeaves - Array of short leaves
 * @param {string} leave_category - Category of leave being requested
 * @param {string} secLeaveOption - Leave option for half-day leaves
 * @param {Object} connection - Database connection
 * @returns {Object|null} Error object if validation fails, null otherwise
 */
const validateShortLeaves = async (
  shortLeaves,
  leave_category,
  secLeaveOption,
  connection
) => {
  if (shortLeaves.length === 0) return null;

  // Check for full-day leave conflicts
  if (![LEAVE_TYPES.SHORT, LEAVE_TYPES.HALF_DAY].includes(leave_category)) {
    return {
      status: 400,
      error: `One or more short leaves exists for the requested date. Please delete them first.`,
    };
  }

  // Check for half-day leave conflicts
  if (leave_category === LEAVE_TYPES.HALF_DAY) {
    const fromTimeInSeconds = inSeconds(shortLeaves[0].fromTime);
    const toTimeInSeconds = inSeconds(shortLeaves[0].toTime);

    if (
      (secLeaveOption === "before_noon" &&
        fromTimeInSeconds <= NOON_TIME_SECONDS) ||
      (secLeaveOption === "after_noon" && toTimeInSeconds >= NOON_TIME_SECONDS)
    ) {
      return {
        status: 400,
        error:
          "A short-leave overlaps with the request. Modify or delete the existing leave first.",
      };
    }
  }

  // Check for short-leave conflict
  if (leave_category === LEAVE_TYPES.SHORT) {
    if (!secLeaveOption.fromTime || !secLeaveOption.toTime) {
      return { status: 400, error: "Bad Request: Invalid Time" };
    }

    const fromTimeInSeconds = inSeconds(secLeaveOption.fromTime);
    const toTimeInSeconds = inSeconds(secLeaveOption.toTime);

    const [existingShortLeaves] = await connection.query(
      `SELECT short_leave_from, short_leave_to 
     FROM leave_details 
     WHERE leave_id IN (?)`,
      [shortLeaves.map((leave) => leave.id)]
    );

    // Overlapping short-leave exist --> Reject new Request
    for (const leave of existingShortLeaves) {
      const existingFromTimeInSeconds = inSeconds(leave.short_leave_from);
      const existingToTimeInSeconds = inSeconds(leave.short_leave_to);

      if (
        fromTimeInSeconds < existingToTimeInSeconds &&
        toTimeInSeconds > existingFromTimeInSeconds
      ) {
        return {
          status: 400,
          error: `Short leave time overlaps with an existing leave. Modify or delete the previous leave first.`,
        };
      }
    }
  }

  return null;
};

/**
 * Main function to validate leave requests
 * @param {Array} leaveDates - Array of dates to validate
 * @param {Object} leaveRecords - Organized leave records
 * @param {Object} connection - Database connection
 * @param {Object} params - Additional parameters (leave_category, secLeaveOption)
 * @returns {Object|null} Error object if validation fails, null otherwise
 */
const checkLeaveOverlap = async (
  leaveDates,
  allExistingLeaves,
  connection,
  params
) => {
  const leaveRecords = organizeLeavesByDate(allExistingLeaves);
  const { leave_category, secLeaveOption } = params;
  if (leave_category === LEAVE_TYPES.GRANTED) return null;

  for (const date of leaveDates) {
    const existingLeaves = leaveRecords[date] || [];

    // Check for full-day leaves
    if (hasFullDayLeaves(existingLeaves)) {
      return {
        status: 400,
        error: `Leave already exist for one or more day(s). First conflict found for ${date}. Modify or delete conflicting leaves first.`,
      };
    }

    // Check for half-day leave conflicts
    const halfDayLeaves = existingLeaves.filter(
      (l) => l.leave_category === LEAVE_TYPES.HALF_DAY
    );
    const halfDayError = await validateHalfDayLeaves(
      halfDayLeaves,
      connection,
      secLeaveOption,
      leave_category
    );
    if (halfDayError) return halfDayError;

    // Check for short leave conflicts
    const shortLeaves = existingLeaves.filter(
      (l) => l.leave_category === LEAVE_TYPES.SHORT
    );
    const shortLeaveError = await validateShortLeaves(
      shortLeaves,
      leave_category,
      secLeaveOption,
      connection
    );
    if (shortLeaveError) return shortLeaveError;
  }

  return null;
};

module.exports = checkLeaveOverlap;
