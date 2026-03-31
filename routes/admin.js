const express = require('express');
const multer = require('multer');
const admin_router = express.Router()
const db = require('../DataBaseConnection')
// const runQuery = require('../RunQuery');
const {runQuery,runTransaction} = require('../RunQuery');
const Notification = require("../Notification");
function getTimeStamp() {
  return (new Date().toLocaleString("en-CA", { timeZone: 'Asia/Kolkata' }).split(',')[0] + " " + new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false }))
}
function getNotification(req) {
  const Notifications = (req.session.Notifications) ? JSON.parse(req.session.Notifications) : null;
  req.session.Notifications = null;
  return Notifications;
}
module.exports = (io) => {

  function sendNotification(To, Content) {
    return new Promise(async (resolve, reject) => {
      const data = {
        Employee_Id: To,
        message: Content,
        created_at: getTimeStamp(),
      }
      await runQuery('insert into notifications set ?', [data]).then(result => {
        io.emit(`notification-${To}`, Content);
        resolve(result)
      }).catch(error => {
        reject(error)
      });
    });
  }

  admin_router.get('/', async (req, res) => {
    if (req.session.UserID && req.session.UserRole == "Admin") {
      const users = await runQuery("SELECT count(*) as Count,Role FROM users group by Role");
      const Customers = await runQuery("SELECT  Name FROM customers where Status=1;");
      return res.render('../views/admin/admin-Home', { userData: req.session.UserData, Notifications: getNotification(req), Count: { users, Customers } })
    } else {
      res.redirect('/login');
    }
  });
  admin_router.post("/CreateUser", async (req, res) => {
    if (req.session.UserID && req.session.UserRole == "Admin") {
      let data = req.body;
      let ManagerID = data.Reporting_Manager_Name;
      let managerInfo = await runQuery("Select * from users where Employee_ID=? and Status='Active'", [ManagerID]);
      data.Reporting_Manager_Name = managerInfo[0].Full_Name;
      data.Reporting_Manager_Mail = managerInfo[0].Email_ID;
      try {
        let insertResult = await runQuery("Insert into users set ?", [data]);
        const temp = new Notification(
          "Success..!",
          "User added successfully.",
          "success",
          "5s"
        );
        req.session.Notifications = JSON.stringify(temp);
      } catch (er) {
        if (er?.code == "ER_DUP_ENTRY") {
          const temp = new Notification(
            "Error..!",
            "The user is already exist.",
            "error",
            "5s"
          );
          req.session.Notifications = JSON.stringify(temp);
        } else {
          const temp = new Notification(
            "Error..!",
            "Unable to add new user.\nTry again.",
            "error",
            "5s"
          );
          req.session.Notifications = JSON.stringify(temp);
        }
      } finally {
        res.redirect(req.headers.referer);
      }
    } else {
      res.redirect("/")
    }
  })
  admin_router.get('/users', async (req, res) => {
    if (req.session.UserID && req.session.UserRole == "Admin") {
      const conditions = [];
      for (const key in req.query) {
        const value = req.query[key];
        if (value !== "" && value !== undefined) {
          conditions.push(`Employee_ID REGEXP '${value}'`);
          conditions.push(`Full_Name REGEXP '${value}'`);
        }
      }
      const whereClause = conditions.length > 0 ? "AND " + conditions.join(" or ") : "";
      try {
        const result = await runQuery(`SELECT * FROM users where Employee_ID!=? ${whereClause}`, [req.session.UserID]);
        let ReportingManagers = await runQuery("Select * from users where Status='Active' order by Full_Name");
        res.render('../views/admin/admin-Users', { Data: result, ReportingManagers: ReportingManagers, userData: req.session.UserData, Notifications: getNotification(req) })
      } catch (error) {
        console.log(error)
      }
    } else {
      res.redirect('/login');
    }
  })
  admin_router.get('/Customers', (req, res) => {
    if (req.session.UserID && req.session.UserRole == "Admin") {
      db.query('SELECT * FROM customers', (error, result) => {
        if (error) {
          console.log(error)
          return;
        } else {
          res.render('../views/admin/admin-Customer', { Data: result, userData: req.session.UserData, Notifications: getNotification(req) })
        }
      })
    } else {
      res.redirect('/login');
    }
  })
  admin_router.post("/UpdateUser", async (req, res) => {
    if (req.session.UserID && req.session.UserRole == "Admin") {
      let data = req.body;
      let Status = "Active";
      if (!data.hasOwnProperty("Status")) {
        Status = "Inactive"
      }
      data.Status = Status
      await runQuery("Update users set ? where Employee_ID=?", [data, data.Employee_ID]).then(() => {
        const temp = new Notification(
          "Success..!",
          "User details updated successfully.",
          "success",
          "5s"
        );
        req.session.Notifications = JSON.stringify(temp);
        res.redirect(req.headers.referer)
      }).catch(er => {
        console.log(er);
        const temp = new Notification(
          "Error..!",
          "Unable to update the user details.\nTry again.",
          "error",
          "5s"
        );
        req.session.Notifications = JSON.stringify(temp);
        res.redirect(req.headers.referer)
      })

    } else {
      res.redirect('/login');
    }
  })
  admin_router.get("/Milestone_List", async (req, res, next) => {
    if (req.session.UserID && req.session.UserRole == "Admin") {
      try {
        const conditions = [];
        for (const key in req.query) {
          const value = req.query[key];
          if (value !== "" && value !== undefined) {
            if (key == "Project_ID") {
              conditions.push(`${key} REGEXP '${value}$'`);
            } else {
              conditions.push(`${key} = '${value}'`);
            }
          }
        }
        const whereClause =
          conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
        const QC_List = await runQuery("SELECT * FROM `qc-portal`.checklist;");
        const users = await runQuery(
          'select Employee_ID,Full_Name,Role from users where Status="Active" order by Full_Name'
        );
        const milestones = await runQuery(
          `select *,DATE_FORMAT(Due_Date,'%Y-%m-%d') as f_Due_Date,DATE_FORMAT(QC_TGT_End_Date,'%Y-%m-%d') as f_QC_TGT_End_Date,DATE_FORMAT(QC_ACT_End_Date,'%Y-%m-%d') as f_QC_ACT_End_Date,
          DATE_FORMAT(Prod_TGT_Start_Date,'%c/%d/%y') as Prod_TGT_Start_Date,DATE_FORMAT(Prod_TGT_End_Date,'%c/%d/%y') as Prod_TGT_End_Date,DATE_FORMAT(QC_TGT_Start_Date,'%c/%d/%y') as QC_TGT_Start_Date,
          DATE_FORMAT(QC_TGT_End_Date,'%c/%d/%y') as QC_TGT_End_Date,DATE_FORMAT(QC_ACT_End_Date,'%c/%d/%y') as QC_ACT_End_Date,DATE_FORMAT(Due_Date,'%c/%d/%y') as Due_Date,DATE_FORMAT(Created_Date,'%c/%d/%y') as Created_Date from milestone 
          ${whereClause} order by idmilestone desc`);
        let Status = getUniqueValuesForKey(milestones, "Milestone_Status");
        res.render("../views/PMO/Milestone_List", {
          userData: req.session.UserData,
          Notifications: getNotification(req),
          Milestone: milestones,
          Owners: users,
          QC_List: QC_List,
          FilterData: { Status },
        });
      } catch (error) {
        console.log(error)
        next(error);
      }
    } else {
      res.redirect("/login");
    }
  });
  admin_router.get("/Task_List", async (req, res, next) => {
    if (req.session.UserID && req.session.UserRole == "Admin") {
      try {
        const conditions = [];
        for (const key in req.query) {
          const value = req.query[key];
          if (value !== "" && value !== undefined) {
            if (key == "Project_ID" || key == "Milestone_Name") {
              conditions.push(`T.${key} REGEXP '${value}$'`);
            } else {
              conditions.push(`${key} = '${value}'`);
            }
          }
        }
        const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
        const data = await runQuery(`select T.*,date_format(T.StartDate,'%c/%d/%y') as StartDate,date_format(T.DueDate,'%c/%d/%y') as DueDate,
          date_format(T.EndDate,'%c/%d/%y') as EndDate,DATE_FORMAT(T.DueDate,'%Y-%m-%d') as f_DueDate,DATE_FORMAT(T.EndDate,'%Y-%m-%d') as f_EndDate,m.Customer
          from task  as T inner join milestone as m on m.Milestone_Name=T.Milestone_Name ${whereClause}`);
        let Status = getUniqueValuesForKey(data, "Status");
        res.render('../views/Employees/Task_List', { userData: req.session.UserData, Notifications: getNotification(req), Task: data, FilterData: { Status }, });
      } catch (error) {
        console.log(error)
      }
    } else {
      res.redirect("/")
    }
  })
  admin_router.get("/Sub_Task_List", async (req, res, next) => {
    if (req.session.UserID && req.session.UserRole == "Admin") {
      try {
        const conditions = [];
        for (const key in req.query) {
          const value = req.query[key];
          if (value !== "" && value !== undefined) {
            if (key == "Project_ID" || key == "Milestone_Name") {
              conditions.push(`T.${key} REGEXP '${value}$'`);
            } else {
              conditions.push(`${key} = '${value}'`);
            }
          }
        }
        const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
        const data = await runQuery(`select T.*,date_format(T.StartDate,'%c/%d/%y') as StartDate,date_format(T.Due_Date,'%c/%d/%y') as DueDate,
        date_format(T.EndDate,'%c/%d/%y') as EndDate,DATE_FORMAT(T.Due_Date,'%Y-%m-%d') as f_DueDate,DATE_FORMAT(T.EndDate,'%Y-%m-%d') as f_EndDate,m.Customer
        from subtask  as T inner join milestone as m on m.Milestone_Name=T.Milestone_Name ${whereClause}`);
        let Status = getUniqueValuesForKey(data, "Status");
        res.render('../views/Employees/Subtask_List', { userData: req.session.UserData, Notifications: getNotification(req), subtask: data, FilterData: { Status }, });
      } catch (error) {
        console.log(error)
      }
    } else {
      res.redirect("/")
    }
  })
  admin_router.get("/Markup_List", async (req, res, next) => {
    if (req.session.UserID && req.session.UserRole == "Admin") {
      try {
        const conditions = [];
        for (const key in req.query) {
          const value = req.query[key];
          if (value !== "" && value !== undefined) {
            if (key == "Project_ID" || key == "Milestone_Name") {
              conditions.push(`T.${key} REGEXP '${value}$'`);
            } else {
              conditions.push(`${key} = '${value}'`);
            }
          }
        }
        const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
        const data = await runQuery(`select T.*,date_format(T.DueDate,'%c/%d/%y') as DueDate,date_format(T.StartDate,'%c/%d/%y') as StartDate,date_format(T.EndDate,'%c/%d/%y') as EndDate,
        DATE_FORMAT(T.DueDate,'%Y-%m-%d') as f_DueDate,DATE_FORMAT(T.EndDate,'%Y-%m-%d') as f_EndDate from markup as T ${whereClause}`);
        let Status = getUniqueValuesForKey(data, "Status");
        res.render('../views/Employees/Markup_List', { userData: req.session.UserData, Notifications: getNotification(req), markup: data, FilterData: { Status }, });
      } catch (error) {
        console.log(error)
      }
    } else {
      res.redirect("/")
    }
  })
  admin_router.get("/TimeSheets", async (req, res, next) => {
    if (req.session.UserID && req.session.UserRole == "Admin") {
      const { start_date, end_date, min_duration, max_duration, Full_Name, Milestone_Name, TaskName, Project_ID } = req.query;
      let query = "SELECT u.Full_Name,coalesce(t.Project_ID,s.Project_ID,m.Project_ID) as Project_ID,coalesce(t.Milestone_Name,s.Milestone_Name,m.Milestone_Name) as Milestone_Name,tm.*,DATE_FORMAT(tm.startTime,'%Y-%m-%d / %T') as startTime,DATE_FORMAT(tm.endTime,'%Y-%m-%d  /%T') as endTime FROM timesheet as tm left join task as t on tm.TaskName=t.TaskName left join users as u on u.Employee_ID=tm.UserID left join subtask as s on tm.TaskName=s.SubTaskName left join markup as m on m.Sub_Task_Name=tm.TaskName where 1=1";
      let params = [];

      // Filter by start date
      if (start_date) {
        query += " AND Date(tm.startTime) >= ?";
        params.push(start_date);
      }

      // Filter by end date
      if (end_date) {
        query += " AND Date(tm.endTime) <= ?";
        params.push(end_date);
      }

      if (Project_ID) {
        query += " AND coalesce(t.Project_ID,s.Project_ID,m.Project_ID) = ?";
        params.push(Project_ID);
      }
      if (Milestone_Name) {
        query += " AND coalesce(t.Milestone_Name,s.Milestone_Name,m.Milestone_Name) = ?";
        params.push(Milestone_Name);
      }
      if (TaskName) {
        query += " AND tm.TaskName = ?";
        params.push(TaskName);
      }
      if (Full_Name) {
        query += " AND u.Full_Name REGEXP ?";
        params.push(Full_Name);
      }

      // Filter by minimum duration
      if (min_duration && max_duration) {
        query += " AND tm.duration / 3600 BETWEEN ? AND ?";
        params.push(parseInt(min_duration));
        params.push(parseInt(max_duration));
      }
      query += " order by  tm.duration desc limit 100";
      const logData = await runQuery(query, params).catch(er => {
        console.log(er)
      });
      res.render("../views/admin/TimeSheet", { userData: req.session.UserData, Notifications: getNotification(req), logData: logData });
    } else {
      res.redirect('/login');
    }
  })
  admin_router.get("/AttachmentReport", async (req, res) => {
    if (req.session.UserID && req.session.UserRole == "Admin") {
      const { start_date, end_date } = req.query;
      const query = `( SELECT 
              milestone.Customer AS Customer,
              task.Project_ID as Project,
              task.Milestone_Name as Milestone_Name,
              task.TaskName AS TaskName,
              date_format(task.StartDate,'%c/%d/%y') as StartDate,
              date_format(task.EndDate,'%c/%d/%y') as EndDate,
              users.Full_Name as Owner,
              COUNT(attachments.TaskID) AS AttachmentCount,
              'Task' AS Category 
          FROM task
          LEFT JOIN attachments ON attachments.TaskID = task.TaskName 
          LEFT JOIN milestone ON milestone.Milestone_Name = task.Milestone_Name 
          LEFT JOIN users ON users.Employee_ID = task.Owner
          WHERE (DATE(task.EndDate) BETWEEN ? AND ? ) 
          AND attachments.TaskID IS NULL GROUP BY milestone.Customer, task.Project_ID, task.Milestone_Name, task.TaskName, task.StartDate, task.EndDate, users.Full_Name ) UNION ( SELECT  milestone.Customer AS Customer,
              subtask.Project_ID as Project,
              subtask.Milestone_Name as Milestone_Name,
              subtask.SubTaskName AS TaskName,
              date_format(subtask.StartDate,'%c/%d/%y') as StartDate,
              date_format(subtask.EndDate,'%c/%d/%y') as EndDate,
              users.Full_Name as Owner,
              COUNT(attachments.TaskID) AS AttachmentCount,
              'SubTask' AS Category
          FROM subtask
          LEFT JOIN attachments ON attachments.TaskID = subtask.SubTaskName 
          LEFT JOIN milestone ON milestone.Milestone_Name = subtask.Milestone_Name 
          LEFT JOIN users ON users.Employee_ID = subtask.Owner
          WHERE (DATE(subtask.EndDate) BETWEEN ? AND ? )
          AND attachments.TaskID IS NULL GROUP BY milestone.Customer, subtask.Project_ID, subtask.Milestone_Name, subtask.SubTaskName, subtask.StartDate, subtask.EndDate, users.Full_Name ) UNION ( SELECT 
              milestone.Customer AS Customer,
              markup.Project_ID as Project,
              markup.Milestone_Name as Milestone_Name,
              markup.Sub_Task_Name AS TaskName, 
              date_format(markup.StartDate,'%c/%d/%y') as StartDate,
              date_format(markup.EndDate,'%c/%d/%y') as EndDate,
              users.Full_Name as Owner,
              COUNT(attachments.TaskID) AS AttachmentCount,
              'Markup' AS Category
          FROM markup
          LEFT JOIN attachments ON attachments.TaskID = markup.Sub_Task_Name 
          LEFT JOIN milestone ON milestone.Milestone_Name = markup.Milestone_Name 
          LEFT JOIN users ON users.Employee_ID = markup.Owner
          WHERE (DATE(markup.EndDate) BETWEEN ? AND ? )
          AND attachments.TaskID IS NULL GROUP BY milestone.Customer, markup.Project_ID, markup.Milestone_Name, markup.Sub_Task_Name, markup.StartDate, markup.EndDate, users.Full_Name ) `;
      const startDate = start_date || '0000-01-01';
      const endDate = end_date || '9999-12-31';
      // Execute the query using placeholders to securely inject parameters
      try {

        const logData = await runQuery(query, [startDate, endDate, startDate, endDate, startDate, endDate]);
        res.render("../views/admin/AttachmentsReport", { userData: req.session.UserData, Notifications: getNotification(req), logData: logData });
      } catch (error) {
        console.log(error)
      }
    } else {
      res.redirect('/login');
    }
  });
  admin_router.get("*", (req, res) => {
    res.redirect('/NotFound')
  })
  // Function to pull out unique values for each key in the array of objects
  const getUniqueValuesForKey = (array, key) => {
    // Use reduce to accumulate unique values for the specified key
    const uniqueValues = array.reduce((accumulator, currentValue) => {
      // Use Set to store unique values for the key
      accumulator.add(currentValue[key]);
      return accumulator;
    }, new Set());

    // Convert Set to array to return the unique values
    return Array.from(uniqueValues);
  };
  return admin_router;
}
// module.exports = admin_router