/**
 * Function to convert time in Seconds
 * @param {String} time - Time string in the format hh:mm OR hh:mm:ss
 * @returns {null | Number} returns null if the time-string is invalid, time in seconds otherwise.
 */
const inSeconds = function (time) {
  if (typeof time !== "string" || !time) {
    console.log("Invalid time ");
    return null;
  }
  const [hours, minutes, seconds = 0] = time.split(":").map(Number);
  return hours * 60 * 60 + minutes * 60 + seconds || null;
};

/**
 * Generate all dates in the date-range
 * @param {String} start - Date in the format yyyy-MM-dd
 * @param {String} end - Date in the format yyyy-MM-dd
 * @returns {Array} Returns array of all the dates between start and end including both lower and upper bounds
 */
const getDateRange = function (start, end) {
  const dateArray = [];
  let currentDate = new Date(start);
  const lastDate = new Date(end);

  while (currentDate <= lastDate) {
    dateArray.push(currentDate.toISOString().split("T")[0]);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dateArray;
};

/**
 * Function to check valid date range
 * @param {String} start - Starting date in the format yyyy-MM-dd
 * @param {String} end - End date in the format yyyy-MM-dd
 * @returns {boolean} Returns true if range is valid, false otherwise
 */
const validDateRange = (start, end) => {
  const fromDate = new Date(start);
  const toDate = new Date(end);

  if (fromDate > toDate) false;
  return true;
};

module.exports = { inSeconds, getDateRange, validDateRange };
