const express = require('express');
const multer = require('multer');
const SendEmail = require('../Email');
const manager_router = express.Router()
const db = require('../DataBaseConnection');
// const runQuery = require('../RunQuery');
const {runQuery,runTransaction} = require('../RunQuery');
const Notification = require('../Notification');
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
function getTimeStamp() {
  return(new Date().toLocaleString("en-CA", {timeZone: 'Asia/Kolkata'}).split(',')[0]+ " " + new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata',hour12:false }))
}
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
  function getNotification(req) {
    const Notifications = (req.session.Notifications) ? JSON.parse(req.session.Notifications) : null;
    req.session.Notifications = null;
    return Notifications;
  }

  const getUniqueValuesForKey = (array, key) => {
    // Use reduce to accumulate unique values for the specified key
    const uniqueValues = array.reduce((accumulator, currentValue) => {
      // Use Set to store unique values for the key
      accumulator.add(currentValue[key]);
      return accumulator;
    }, new Set());
    return Array.from(uniqueValues);
  };
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
        })
    });
 }
  manager_router.get('/', async (req, res, next) => {
    if (req.session.UserID && req.session.UserRole == "Manager") {
      try {
        let NewMilestone=[];
        let milestones = await runQuery("select *,DATE_FORMAT(Prod_TGT_Start_Date,'%c/%d/%y') as Prod_TGT_Start_Date,DATE_FORMAT(Prod_TGT_End_Date,'%c/%d/%y') as Prod_TGT_End_Date,DATE_FORMAT(QC_TGT_Start_Date,'%c/%d/%y') as QC_TGT_Start_Date,DATE_FORMAT(QC_TGT_End_Date,'%c/%d/%y') as QC_TGT_End_Date,DATE_FORMAT(Due_Date,'%c/%d/%y') as Due_Date from milestone where Owner=? and Milestone_Status not in('Completed','IQC - Comp','Short-Closed','Approved','Submitted - Awaiting Approval') order by idmilestone desc", [req.session.UserID]);
        for (let record of milestones){
          let name=await getProjectDetails(record.Customer,record.idProjects);
          if(name==undefined){
            break;
          }
          name=name.Job_Name
          record.Job_Name=name
          NewMilestone.push(record);
        }
        const task = await runQuery("select M.Customer,T.*,DATE_FORMAT(T.StartDate,'%c/%d/%y') as StartDate,DATE_FORMAT(T.EndDate,'%c/%d/%y') as EndDate,DATE_FORMAT(T.DueDate,'%c/%d/%y') as DueDate from task  T inner join milestone M on T.Milestone_Name=M.Milestone_Name where T.Owner=? and T.Status not in ('Completed','Ready for QC') order by idTask desc", [req.session.UserID]);
        const SubTask= await runQuery("Select T.*,M.Customer as Customer, DATE_FORMAT(T.StartDate,'%c/%d/%y') as StartDate,DATE_FORMAT(T.EndDate,'%c/%d/%y') as EndDate,DATE_FORMAT(T.Due_Date,'%c/%d/%y') as DueDate from subtask T inner join milestone M on T.Milestone_Name=M.Milestone_Name where T.Owner=? and T.Status not in ('Completed','Ready for QC') order by idSubTask desc",[req.session.UserID]);
        const markups = await runQuery("select M.Customer,T.*,DATE_FORMAT(T.DueDate,'%c/%d/%y') as DueDate,DATE_FORMAT(T.StartDate,'%c/%d/%y') as StartDate,DATE_FORMAT(T.EndDate,'%c/%d/%y') as EndDate from markup T inner join milestone M on T.Milestone_Name=M.Milestone_Name where T.Owner=? and T.Status!='Completed' order by idsubtask desc", [req.session.UserID]);
        res.render('../views/Manager/Manager-Home', { userData: req.session.UserData, Notifications: getNotification(req), Milestone: NewMilestone, Task: task,subtask:SubTask, Markups: markups })
      } catch (error) {
        next(error)
      }
    } else {
      res.redirect('/login');
    }
  });
  manager_router.get('/Milestone_List', async (req, res, next) => {
    if (req.session.UserID && req.session.UserRole == "Manager") {
      try {
        const conditions = [];
        for (const key in req.query) {
          const value = req.query[key];
          if (value !== '' && value !== undefined) {
            if (key == "Project_ID") {
              conditions.push(`${key} REGEXP '${value}$'`);
            }else if(key=="Owner"){
              conditions.push(` Milestone_Name in (select Milestone_Name from markup where Owner='${value}' union select Milestone_Name from subtask where Owner='${value}' union select Milestone_Name from task where Owner='${value}')`);
            } else {
              conditions.push(`${key} = '${value}'`);
            }
          }
        }
        const whereClause = conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : '';
        const QC_List = await runQuery("SELECT * FROM `qc-portal`.checklist;");
        const users = await runQuery('select Employee_ID,Full_Name,Role from users where Status="Active" order by Full_Name')
        const milestones = await runQuery(`select *,DATE_FORMAT(Due_Date,'%Y-%m-%d') as f_Due_Date,DATE_FORMAT(QC_TGT_End_Date,'%Y-%m-%d') as f_QC_TGT_End_Date,DATE_FORMAT(QC_ACT_End_Date,'%Y-%m-%d') as f_QC_ACT_End_Date,DATE_FORMAT(Due_Date,'%c/%d/%y') as Due_Date,DATE_FORMAT(Prod_TGT_Start_Date,'%c/%d/%y') as Prod_TGT_Start_Date,DATE_FORMAT(Prod_TGT_End_Date,'%c/%d/%y') as Prod_TGT_End_Date,DATE_FORMAT(QC_TGT_Start_Date,'%c/%d/%y') as QC_TGT_Start_Date,DATE_FORMAT(QC_TGT_End_Date,'%c/%d/%y') as QC_TGT_End_Date,DATE_FORMAT(Created_Date,'%c/%d/%y') as Created_Date from milestone where Owner=? ${whereClause} order by Prod_TGT_End_Date asc`, [req.session.UserID]);
        let Status = getUniqueValuesForKey(milestones, "Milestone_Status");
        res.render('../views/PMO/Milestone_List', { userData: req.session.UserData, Notifications: getNotification(req), Milestone: milestones, Owners: users, QC_List: QC_List, FilterData: { Status } })
      } catch (error) {
        console.log(error)
        next(error)
      }
    } else {
      res.redirect('/login');
    }
  });
  manager_router.get('/users', (req, res) => {
    if (req.session.UserID && req.session.UserRole == "Manager") {
      db.query('SELECT * FROM users where Employee_ID!=?', [req.session.UserID], (error, result) => {
        if (error) {
          console.log(error)
          return;
        } else {
          res.render('../views/Manager/Manager-Users', { Data: result, userData: req.session.UserData, Notifications: getNotification(req) })
        }
      })
    } else {
      res.redirect('/login');
    }
  })
  manager_router.get('/Customers', (req, res) => {
    if (req.session.UserID && req.session.UserRole == "Manager") {
      db.query('SELECT * FROM customers', (error, result) => {
        if (error) {
          console.log(error)
          return;
        } else {
          res.render('../views/Manager/Manager-Customer', { Data: result, userData: req.session.UserData, Notifications: getNotification(req) })
        }
      })
    } else {
      res.redirect('/login');
    }
  });
  manager_router.post("/PushJobToPMO", (req, res) => {
    const body = req.body;
    let milestones = body.Milestone_Name;
    milestones = Array.isArray(milestones) ? milestones : [milestones];
    sendNotification(body.PMO, `Milestone Completion ${milestones.join(",")} by ${req.session.UserName}`);
    runQuery("select * from users where Employee_ID=?", [body.PMO]).then(async data => {
      if (data.length > 0) {
        await SendEmail(data[0].Email_ID,"",`Milestone Completion : ${milestones.join("_")}`, `<div style="font-size:14px">
        <p>Dear PMO,</p>
        <hr>
        <p>The milestone(s) <b>${milestones.join(",")}</b> has been successfully completed and is ready for submission.</p>
        <hr>
        <p>Please proceed with the submission, including all relevant documentation and update the status/Dates on the QGPMS.</p>
        <small>Note: This is autogenerated email, No need to reply.</small>
    </div>`);
      }
    });
    req.session.Notifications=JSON.stringify(new Notification('Success..!', "Notified the PMO Successfully.", 'success', '2s'));
    return res.redirect(req.headers.referer);
  });

  manager_router.get("*", (req, res) => {
    res.redirect('/NotFound')
  })
  return manager_router;
}
//module.exports = manager_router