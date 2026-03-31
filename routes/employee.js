const express = require('express');
const employee_router = express.Router()
const db = require('../DataBaseConnection');
const SendEmail = require('../Email');
// const runQuery = require('../RunQuery');
const {runQuery,runTransaction} = require('../RunQuery');
const { json } = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const path = require("path");
const Notification = require('../Notification')
function getTimeStamp() {
  return(new Date().toLocaleString("en-CA", {timeZone: 'Asia/Kolkata'}).split(',')[0]+ " " + new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata',hour12:false }))
}
function getNotification(req) {
  const Notifications = (req.session.Notifications) ? JSON.parse(req.session.Notifications) : null;
  req.session.Notifications = null;
  return Notifications;
}
function getBaseURL(req) {
  return (`${req.protocol}` + '://' + `${req.get('host')}`);
}
const projectTableNames = {
  Mastec: {
    Table: 'mastecprojects',
    ProjectColumn: 'JOB_ID'
  },
  SkyTec: {
    Table: 'skytec',
    ProjectColumn: 'JOB_ID'
  },
  ATX: {
    Table: 'atx',
    ProjectColumn: 'JOB_ID'
  },
  'AT&T': {
    Table: 'att',
    ProjectColumn: 'CFAS_ID'
  }
}
//Setting up Storage Area
const myStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadDir = "./public/uploads/ReferenceDoc";
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  }, filename: function (req, file, cb) {
    cb(null, req.session.UserID + '_' + Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: myStorage, limits: { fileSize: 50 * 1024 * 1024 } });
function getProjectDetails(Customer, ProjectID) {
  return new Promise((resolve, reject) => {
    db.query(
      `select * from ${projectTableNames[Customer].Table} where idProjects=?`,
      [ProjectID],
      (error, result) => {
        if (error) {
          console.log(error);
          reject(error);
        } else {
          resolve(result[0]);
        }
      }
    );
  });
}
module.exports = (io) => {
  function sendNotification(To, Content) {
    return new Promise(async (resolve, reject) => {
      const data = {
        Employee_Id: To,
        message: Content,
        created_at: getTimeStamp(),
      };
      await runQuery("insert into notifications set ?", [data])
        .then((result) => {
          io.emit(`notification-${To}`, Content);
          resolve(result);
        })
        .catch((error) => {
          reject(error);
        });
    });
  }
  employee_router.get('/', async (req, res, next) => {
    if (req.session.UserID && req.session.UserRole == "Employee") {
      try {
        const task = await runQuery("select T.*,M.Customer,date_format(M.Prod_TGT_Start_Date,'%c/%d/%y') as Prod_TGT_Start_Date,date_format(M.Prod_TGT_End_Date,'%c/%d/%y') as Prod_TGT_End_Date,date_format(M.QC_TGT_Start_Date ,'%c/%d/%y') as QC_TGT_Start_Date,date_format(M.QC_TGT_End_Date,'%c/%d/%y') as QC_TGT_End_Date,DATE_FORMAT(T.DueDate,'%c/%d/%y') as DueDate from task  as T  join milestone as M where T.Milestone_Name=M.Milestone_Name and T.Owner=? and T.Status not in ('Completed','Ready for QC')", [req.session.UserID]);
        const markups = await runQuery("select *,DATE_FORMAT(DueDate,'%c/%d/%y') as DueDate,DATE_FORMAT(StartDate,'%c/%d/%y') as StartDate,DATE_FORMAT(EndDate,'%c/%d/%y') as EndDate from markup inner join milestone where milestone.Milestone_Name=markup.Milestone_Name and markup.Owner=? and markup.Status!='Completed'", [req.session.UserID]);
        const SubTask= await runQuery("Select T.*,M.Customer as Customer, DATE_FORMAT(T.StartDate,'%c/%d/%y') as StartDate,DATE_FORMAT(T.EndDate,'%c/%d/%y') as EndDate,DATE_FORMAT(T.Due_Date,'%c/%d/%y') as DueDate from subtask T inner join milestone M on T.Milestone_Name=M.Milestone_Name where T.Owner=? and T.Status not in ('Completed','Ready for QC')",[req.session.UserID]);
        res.render('../views/Employees/Employee-Home', { userData: req.session.UserData, Notifications: getNotification(req), Task: task,subtask:SubTask, Markups: markups })
      } catch (error) {
        next(error)
      }
    } else {
      res.redirect('/login');
    }
  });
  employee_router.post("/CreateMarkup/:Customer/:Milestone/:Task", upload.single("attachment"), async (req, res, next) => {
    if (req.session.UserID) {
      try {
        let Data = req.body;
        //const result = await runQuery("SELECT count(*) as Counter from markup");
        const result = await runQuery("select Sub_Task_Name as TaskName from markup order by idsubtask desc limit 1");
       // let temp = result[0].Counter + 1;
       let TaskName=result[0].TaskName;
       let extract = TaskName.match(/\d+/);
       let temp = parseInt(extract[0]) + 1;
        temp = String(temp).padStart(7, '0');
        Data.Sub_Task_Name = `MKUP_${temp}`;
        Data.CreatedBy = req.session.UserID;
        Data.Created_Date=getTimeStamp();
        Data.Status = 'YTS';
        temp = Data.Comments.replace(/\r?\n/g, '<br/>');
        let Group = {
          Group1: {
            On: getTimeStamp(),
            Note: temp,
            Author_ID: req.session.UserID,
            attachment: res.req.file ? res.req.file.filename : null,
            Author_Name: req.session.UserName,
          }
        }
        delete Data.Comments;
        delete Data.attachment;
        Data.Comments = (temp) ? JSON.stringify(Group) : JSON.stringify({});
        const projectID = await runQuery("select Project_ID,Customer,idProjects from milestone where Milestone_Name=? and idProjects=?", [Data.Milestone_Name,Data.idProjects]);
        const ProjectDetails = await getProjectDetails(projectID[0].Customer, projectID[0].idProjects);
        let ProjectDueDate = ProjectDetails.DueDate ? new Date(ProjectDetails.DueDate) : null;
        let ProjectReceivedDate = ProjectDetails.ReceivedDate ? new Date(ProjectDetails.ReceivedDate) : null;
        ProjectDueDate = (new Date(ProjectDueDate.setDate(ProjectDueDate.getDate() + 1)).toISOString().slice(0, 10));
        ProjectReceivedDate = (new Date(ProjectReceivedDate.setDate(ProjectReceivedDate.getDate() + 1)).toISOString().slice(0, 10));
        if ((Data.DueDate < ProjectReceivedDate)) {
          req.session.Notifications = JSON.stringify(new Notification('Note!', 'The Markup Due Date is exceeding the Project deadline, so the Markup is not created.', 'verified', '10s'));
          return res.redirect(req.headers.referer);
        }else{
        await runQuery("insert into markup set ?", [Data]).then(responses => {
          runQuery("select * from milestone where Milestone_Name=? and idProjects=?", [Data.Milestone_Name,Data.idProjects]).then(async milestone => {
            runQuery("select * from users where Employee_ID=?", [milestone[0].Owner]).then(async Mile_Owner => {
              runQuery("select * from users where Employee_ID=?", [Data.Owner]).then(async Owner => {
                if (Owner.length > 0) {
                  await SendEmail(Owner[0].Email_ID, Mile_Owner[0].Email_ID, `New Markup Assignment: ${Data.Task_Name}_${Data.Sub_Task_Name}`, `<div style="font-size:14px">
              <p>Dear <b>${Owner[0].Full_Name}</b>,</p>
              <p>Please be informed that the following new markup task has been assigned to you.</p>
              <hr>
              <p><b>Markup Name: </b><a href='${getBaseURL(req)}/Markup/${Data.Sub_Task_Name}'>${Data.Sub_Task_Name}</a>
              <p><b>Task Name: </b>${Data.Task_Name}</p>
              <hr>
              <p>Please ensure timely completion of this markup.</p>
              </div>`).then(async()=>{
                await sendNotification(Owner[0].Employee_ID,`New Markup ${Data.Sub_Task_Name} is assigned to you for the Task ${Data.Task_Name}. The Due date is ${Data.DueDate}`);
              });
                }
              });
            });
          })
          req.session.Notifications = JSON.stringify(new Notification('Success..!', 'Markup Successfully Created.', 'success', '2s'));
        }).catch(error => {
          next(error)
          req.session.Notifications = JSON.stringify(new Notification('Error!', 'Something went wrong Unable to Create Markup.Try again...!', 'error', '3s'));
        });
        return res.redirect(req.headers.referer);
      }
      } catch (error) {
        next(error)
        req.session.Notifications = JSON.stringify(new Notification('Error!', 'Something went wrong Unable to Create Markup.Try again...!', 'error', '3s'));
        return res.redirect(req.headers.referer);
      }
    } else {
      res.redirect('/');
    }
  })
  employee_router.get("*", (req, res) => {
    res.redirect('/NotFound')
  })
  return employee_router
}
//module.exports = employee_router