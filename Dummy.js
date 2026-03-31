const runQuery = require("./RunQuery");

const getTimesheetData = async (userId) => {
  const query = `SELECT * FROM timesheet WHERE UserID = ?`;
  return await runQuery(query, [userId]);
};
const processTimesheetEntry = (entry) => {
  let startTime = new Date(entry.startTime);
  let endTime = new Date(entry.endTime);
  let timesheetByDay = [];

  // Adjust to local timezone
  startTime = new Date(
    startTime.getTime() - startTime.getTimezoneOffset() * 60 * 1000
  );
  endTime = new Date(
    endTime.getTime() - endTime.getTimezoneOffset() * 60 * 1000
  );
  // Loop over each day from startTime to endTime
  while (startTime <= endTime) {
    let dayEnd = new Date(startTime);
    dayEnd.setHours(23, 59, 59, 999); // End of the current day

    if (dayEnd > endTime) {
      dayEnd = endTime; // Don't go past the endTime
    }

    // Calculate hours for the current day
    const hoursWorked = ((dayEnd - startTime) / (1000 * 60 * 60)).toFixed(2); // Convert milliseconds to hours
    timesheetByDay.push({
      date: startTime.toISOString().split("T")[0],
      hoursWorked: parseFloat(hoursWorked),
    });

    // Move startTime to the next day
    startTime = new Date(dayEnd);
    startTime.setHours(0, 0, 0, 0); // Start of the next day
    startTime.setDate(startTime.getDate() + 1);
  }

  return timesheetByDay;
};
const convertToHHMM = (hours) => {
  const intHours = Math.floor(hours); // Integer part (hours)
  const minutes = Math.round((hours - intHours) * 60); // Fractional part to minutes
  return `${intHours}.${minutes.toString().padStart(2, "0")}`; // Format as HH.MM
};

const generateTimeSheet = async (userId, startDate, endDate) => {
  let entries = await getTimesheetData(userId);
  let timesheet = {};
  let current = new Date(startDate);
  let end = new Date(endDate);
  while (current <= end) {
    const dateString = current.toISOString().split("T")[0];
    timesheet[dateString] = "0.00"; // Initialize with 0 hours
    current.setDate(current.getDate() + 1); // Move to the next day
  }

  entries.forEach((entry) => {
    let processedEntry = processTimesheetEntry(entry);
    processedEntry.forEach((dayEntry) => {
      if (timesheet[dayEntry.date] !== undefined) {
        const totalHours =
          parseFloat(timesheet[dayEntry.date]) + dayEntry.hoursWorked;
        timesheet[dayEntry.date] = convertToHHMM(totalHours);
      }
    });
  });

  return timesheet;
};

generateTimeSheet("QGI567", "2024-05-01", "2024-10-30")
  .then((res) => {
    console.log(res);
  })
  .catch((er) => {
    console.log(er);
  });
[
  {
    id: "estimate_row-1",
    data: [
      17,
      "Mastec",
      "MasTec-Tillman",
      "D-HCS104",
      "GA",
      "Distribution",
      "WIP",
      "11/01/24",
      "-",
      "-",
      "E1400",
      3,
      1400,
      "07-01-1911",
      "Invoiced",
      "12/01/24",
      "QGKA/24-25/0014",
      "12/01/24",
      "-",
      "-",
      "-",
      "-",
    ],
  },
  {
    id: "estimate_row-2",
    data: [
      18,
      "Mastec",
      "MasTec-Tillman",
      "D-HCS104",
      "GA",
      "Distribution",
      "WIP",
      "11/01/24",
      "-",
      "-",
      "TPE00F",
      4,
      22.458,
      "03-30-1900",
      "Invoiced",
      "12/01/25",
      "QGKA/24-25/0015",
      "12/01/25",
      "-",
      "-",
      "-",
      "-",
    ],
  },
];
