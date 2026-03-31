const express = require("express");
const multer = require("multer");
const path = require("path");
const db = require("../DataBaseConnection");
const pmo_router = express.Router();
const Notification = require("../Notification");
const SendEmail = require("../Email");
// const runQuery = require("../RunQuery");
const { runQuery, runTransaction } = require('../RunQuery');
const { Console } = require("console");
function getNotification(req) {
  const Notifications = req.session.Notifications
    ? JSON.parse(req.session.Notifications)
    : null;
  req.session.Notifications = null;
  return Notifications;
}

function getTimeStamp() {
  return (new Date().toLocaleString("en-CA", { timeZone: 'Asia/Kolkata' }).split(',')[0] + " " + new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false }));
}
//Setting up Storage Area
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    var uploadDir = "./public/uploads/ProjectDoc";
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(
      null,
      req.session.UserID +
      "_" +
      file.originalname +
      "_" +
      Date.now() +
      path.extname(file.originalname)
    );
  },
});

const upload = multer({ storage: storage }).array("attachment", 5);

const projectTableNames = {
  Mastec: {
    Table: "mastecprojects",
    ProjectColumn: "JOB_ID",
  },
  SkyTec: {
    Table: "skytec",
    ProjectColumn: "JOB_ID",
  },
  ATX: {
    Table: "atx",
    ProjectColumn: "JOB_ID",
  },
  "AT&T": {
    Table: "att",
    ProjectColumn: "CFAS_ID",
  },
};
const isValidCustomer = (Customer) => {
  return new Promise((resolve, reject) => {
    db.query(
      "Select * from customers where Name=?",
      [Customer],
      (error, results) => {
        if (error) {
          reject({ error, params });
        } else {
          if (results.length > 0) {
            resolve(true);
          } else {
            reject(false);
          }
        }
      }
    );
  });
};
function getBaseURL(req) {
  return (`${req.protocol}` + '://' + `${req.get('host')}`);
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
  pmo_router.get("/", async (req, res) => {
    if (req.session.UserID && req.session.UserRole == "PMO") {
      let VisualizeData = {};
      try {
        const milestones = await runQuery(
          "select *,DATE_FORMAT(Prod_TGT_Start_Date,'%c/%d/%y') as Prod_TGT_Start_Date,DATE_FORMAT(Prod_TGT_End_Date,'%c/%d/%y') as Prod_TGT_End_Date,DATE_FORMAT(QC_TGT_Start_Date,'%c/%d/%y') as QC_TGT_Start_Date,DATE_FORMAT(QC_TGT_End_Date,'%c/%d/%y') as QC_TGT_End_Date,DATE_FORMAT(Due_Date,'%c/%d/%y') as Due_Date,DATE_FORMAT(Due_Date,'%Y-%m-%d') as f_Due_Date,DATE_FORMAT(QC_TGT_End_Date,'%Y-%m-%d') as f_QC_TGT_End_Date from milestone where Owner=? and Milestone_Status not in('Completed','IQC - Comp','Short-Closed') order by idmilestone desc",
          [req.session.UserID]
        );
        const task = await runQuery(
          "select M.Customer,T.*,DATE_FORMAT(T.StartDate,'%c/%d/%y') as StartDate,DATE_FORMAT(T.EndDate,'%c/%d/%y') as EndDate,DATE_FORMAT(T.DueDate,'%c/%d/%y') as DueDate,DATE_FORMAT(T.DueDate,'%Y-%m-%d') as f_DueDate,DATE_FORMAT(T.EndDate,'%Y-%m-%d') as f_EndDate from task  T inner join milestone M on T.Milestone_Name=M.Milestone_Name where T.Status not in ('Completed','Ready for QC') and T.Owner=? order by T.idTask desc",
          [req.session.UserID]
        );
        const SubTask = await runQuery("Select T.*,M.Customer as Customer, DATE_FORMAT(T.StartDate,'%c/%d/%y') as StartDate,DATE_FORMAT(T.EndDate,'%c/%d/%y') as EndDate,DATE_FORMAT(T.Due_Date,'%c/%d/%y') as DueDate,DATE_FORMAT(T.Due_Date,'%Y-%m-%d') as f_DueDate from subtask T inner join milestone M on T.Milestone_Name=M.Milestone_Name where T.Status not in ('Completed','Ready for QC') and T.Owner=? order by T.idSubTask desc", [req.session.UserID]);
        res.render("../views/PMO/PMO-Home", {
          userData: req.session.UserData,
          Notifications: getNotification(req),
          Milestone: milestones,
          Task: task,
          subtask: SubTask,
          ActiveCustomer: projectTableNames
        });
      } catch (error) {
        console.log(error);
      }
    } else {
      res.redirect("/login");
    }
  });

  pmo_router.get("/createProject", (req, res) => {
    if (req.session.UserID && req.session.UserRole == "PMO") {
      const Notifications = req.session.Notifications
        ? JSON.parse(req.session.Notifications)
        : null;
      req.session.Notifications = null;
      res.render("../views/PMO/Create-Project-Customer-List", {
        userData: req.session.UserData,
        Notifications: Notifications,
      });
    } else {
      res.redirect("/login");
    }
  });

  pmo_router.get("/createProject/:Customer/:Program", async (req, res, next) => {
    if (req.session.UserID && req.session.UserRole == "PMO") {
      await isValidCustomer(req.params.Customer)
        .then(async (isCustomer) => {
          const result = await runQuery(
            "select SOW,WorkType from customers where Name=?",
            [["MasTec-Windstream", "MasTec-Comcast"].includes(req.params.Program) ? req.params.Program : req.params.Customer]
          );
          let SOW = [];
          let WT = [];
          if (result.length > 0) {
            SOW = result[0].SOW ? result[0].SOW.split(",") : [];
            // WT = result[0].WorkType ? result[0].WorkType.split(",") : [];
          }
          res.render("../views/PMO/CreateProject", {
            Customer: req.params.Customer,
            Program: req.params.Program,
            userData: req.session.UserData,
            Notifications: getNotification(req),
            SOW: SOW
          });
        })
        .catch((er) => {
          res.redirect("/NotFound");
        });
    } else {
      res.redirect("/login");
    }
  });

  pmo_router.post("/createProject/:Customer", async (req, res, next) => {
    if (req.session.UserID && req.session.UserRole == "PMO") {
      let formdata = req.body;
      let temp = {};
      for (const key in formdata) {
        if (key.startsWith("attachment") || key.startsWith("Note")) {
          const num = key.match(/\d+/); // Extract the number from the key using a regex
          if (num) {
            const groupKey = `Group${num}`;
            if (!temp[groupKey]) {
              temp[groupKey] = {};
            }
            temp[groupKey][key] = formdata[key];
            temp[groupKey]["Author_Name"] = req.session.UserName;
            temp[groupKey]["Author_ID"] = req.session.UserID;
            let datetime = new Date();
            let datetimeString = datetime.toLocaleString();
            temp[groupKey]["On"] = datetimeString.replaceAll("/", "-");
          }
          delete formdata[key];
        }
      }
      let approveDate = new Date(formdata.ApprovedDate);
      if (approveDate != "Invalid Date") {
        formdata.ApprovedDate = approveDate.toISOString().slice(0, 10);
      } else {
        delete formdata.ApprovedDate;
      }
      formdata.Note = JSON.stringify(temp);
      formdata.Owner = req.session.UserID;
      formdata.Created_Date = getTimeStamp();
      delete formdata.Customer;
      let sqlQuery = `insert into ${projectTableNames[req.params.Customer].Table
        } set ?`;
      db.query(sqlQuery, [formdata], async (er, result) => {
        if (er) {
          if (er?.code == "ER_DUP_ENTRY") {
            const temp = new Notification(
              "Error..!",
              "Duplicate Entry",
              "error",
              "5s"
            );
            req.session.Notifications = JSON.stringify(temp);
          } else {
            console.log(er);
            next(er);
            const temp = new Notification(
              "Error..!",
              "Internal Server Error.",
              "error",
              "5s"
            );
            req.session.Notifications = JSON.stringify(temp);
          }
          return res.redirect(req.headers.referer)
        } else if (result) {
          const temp = new Notification(
            "Success..!",
            "Project Successfully Created.",
            "success",
            "2s"
          );
          req.session.Notifications = JSON.stringify(temp);
          const SOW = formdata.SOW;
          const ID = formdata.JOB_ID ? formdata.JOB_ID : formdata.CFAS_ID;
          const data = await runQuery(`select * from ${projectTableNames[req.params.Customer].Table} where ${projectTableNames[req.params.Customer].ProjectColumn}=? and SOW=?`, [ID, SOW]);
          if (data.length) {
            res.redirect(`/Project/${req.params.Customer}/${ID}/${data[0].idProjects}`);
          } else {
            return res.redirect(req.headers.referer)
          }
        }
      });
    } else {
      res.redirect("/");
    }
  });

  pmo_router.get("/projects", (req, res) => {
    if (req.session.UserID && req.session.UserRole == "PMO") {
      const Notifications = req.session.Notifications
        ? JSON.parse(req.session.Notifications)
        : null;
      req.session.Notifications = null;
      res.render("../views/PMO/List-Project-Customer-List", {
        userData: req.session.UserData,
        Notifications: Notifications,
      });
    } else {
      res.redirect("/login");
    }
  });
  const getUniqueValuesForKey = (array, key) => {
    const uniqueValues = array.reduce((accumulator, currentValue) => {
      accumulator.add(currentValue[key]);
      return accumulator;
    }, new Set());
    return Array.from(uniqueValues);
  };
  pmo_router.get("/Projects/:Customer/:Program", async (req, res, next) => {
    if (req.session.UserID && req.session.UserRole == "PMO") {
      isValidCustomer(req.params.Customer)
        .then(async (isCustomer) => {
          const conditions = [];
          conditions.push(`Program='${req.params.Program}'`)
          for (let key in req.query) {
            const value = req.query[key];
            if (value !== "" && value !== undefined) {
              if (key == "Status") {
                key = "P.Status";
              }
              conditions.push(`${key} = '${value}'`);
            }
          }
          const whereClause =
            conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";
          const owners = await runQuery(
            'select Employee_ID,Full_Name from users where Role="PMO" or Role="Manager"'
          );
          const temp = await runQuery(
            `select *,DATE_FORMAT(ReceivedDate,'%c/%d/%y') as n_ReceivedDate, DATE_FORMAT(DueDate,'%c/%d/%y') as n_DueDate,DATE_FORMAT(ApprovedDate,'%c/%d/%y') as n_ApprovedDate from ${projectTableNames[req.params.Customer].Table} where Program=?`, [req.params.Program]);
          const projects = await runQuery(`select users.Full_Name,P.*,DATE_FORMAT(ReceivedDate,'%c/%d/%y') as n_ReceivedDate,DATE_FORMAT(SubmittedDate,'%c/%d/%y') as n_SubmittedDate, DATE_FORMAT(DueDate,'%c/%d/%y') as n_DueDate,DATE_FORMAT(ApprovedDate,'%c/%d/%y') as n_ApprovedDate,DATE_FORMAT(DueDate,'%Y-%m-%d') as f_DueDate,DATE_FORMAT(SubmittedDate,'%Y-%m-%d') as f_SubmittedDate,DATE_FORMAT(ApprovedDate,'%Y-%m-%d') as f_ApprovedDate from ${projectTableNames[req.params.Customer].Table} as P inner join users on users.Employee_ID=P.Owner ${whereClause}`);
          let SOW = getUniqueValuesForKey(temp, "SOW");
          let WorkType = getUniqueValuesForKey(temp, "Worktype");
          let Division = getUniqueValuesForKey(temp, "Division");
          let Region = getUniqueValuesForKey(temp, "Region");
          let Status = getUniqueValuesForKey(temp, "Status");
          let MilestoneNameList = await runQuery("SELECT * FROM customers where Name=?", [req.params.Customer]);
          MilestoneNameList = (MilestoneNameList.length && MilestoneNameList[0].Milestone) ? MilestoneNameList[0].Milestone.split(",") : null;
          res.render("../views/PMO/Project-List", {
            Customer: req.params.Customer,
            Data: projects,
            Owners: owners,
            userData: req.session.UserData,
            Notifications: getNotification(req),
            FilterData: { SOW, WorkType, Division, Region, Status: Status },
            MilestoneNameList: MilestoneNameList,
            Program: req.params.Program
          });
        })
        .catch((er) => {
          console.log(er);
          res.redirect("/NotFound");
        });
    } else {
      res.redirect("/login");
    }
  });

  pmo_router.get("/editProject/:Customer/:id", async (req, res, next) => {
    if (req.session.UserID && req.session.UserRole == "PMO") {
      isValidCustomer(req.params.Customer)
        .then(async (isCustomer) => {
          runQuery(
            `select *,DATE_FORMAT(ReceivedDate,'%Y/%c/%d') as n_ReceivedDate, DATE_FORMAT(DueDate,'%Y/%c/%d') as n_DueDate,DATE_FORMAT(ApprovedDate,'%Y/%c/%d') as n_ApprovedDate,DATE_FORMAT(SubmittedDate,'%Y/%c/%d') as n_SubmittedDate from ${projectTableNames[req.params.Customer].Table
            } where idProjects=?`,
            [req.params.id]
          )
            .then(async (project) => {
              if (project.length == 0) {
                return res.redirect("/NotFound");
              }
              const result = await runQuery(
                "select SOW,WorkType from customers where Name=?",
                [["MasTec-Windstream", "MasTec-Comcast"].includes(project[0].Program) ? project[0].Program : req.params.Customer]
              );
              const SOW = result[0].SOW ? result[0].SOW.split(",") : [];
              // const WT = result[0].WorkType ? result[0].WorkType.split(","): [];
              let Comments = JSON.parse(project[0].Note);
              res.render("../views/PMO/Edit-Project", {
                Customer: req.params.Customer,
                Data: project[0],
                userData: req.session.UserData,
                Comments: Comments,
                Notifications: getNotification(req),
                SOW: SOW
              });
            })
            .catch((er) => {
              next(er);
              res.redirect("/NotFound");
            });
        })
        .catch((er) => {
          res.redirect("/NotFound");
        });
    } else {
      res.redirect("/login");
    }
  });

  pmo_router.post("/editProject/:Customer", async (req, res, next) => {
    if (req.session.UserID && req.session.UserRole == "PMO") {
      isValidCustomer(req.params.Customer)
        .then(async (isCustomer) => {
          var formdata = req.body;
          let approveDate = new Date(formdata.ApprovedDate);
          if (approveDate == "Invalid Date") {
            delete formdata.ApprovedDate;
          } else {
            formdata.ApprovedDate = approveDate.toISOString().slice(0, 10);
          }
          let submittedDate = new Date(formdata.SubmittedDate);
          if (submittedDate == "Invalid Date") {
            delete formdata.SubmittedDate;
          } else {
            formdata.SubmittedDate = submittedDate.toISOString().slice(0, 10);
          }
          runQuery(
            `update ${projectTableNames[req.params.Customer].Table
            } set ? where idProjects=?`,
            [formdata, formdata.idProjects]
          )
            .then((result) => {
              req.session.Notifications = JSON.stringify(
                new Notification(
                  "Success..!",
                  "Project Details Updated Successfully.",
                  "success",
                  "5s"
                )
              );
              res.redirect(`/Project/${req.params.Customer}/${formdata.JOB_ID ? formdata.JOB_ID : formdata.CFAS_ID}/${formdata.idProjects}`);
            })
            .catch((er) => {
              console.log(er);
              req.session.Notifications = JSON.stringify(
                new Notification(
                  "Error..!",
                  "Something went wrong unable to update the project details.",
                  "error",
                  "10s"
                )
              );
              res.redirect(req.headers.referer);
            });
        })
        .catch((er) => {
          res.redirect("/NotFound");
        });
    } else {
      res.redirect("/login");
    }
  });

  pmo_router.get("/Milestone_List", async (req, res) => {
    if (req.session.UserID && req.session.UserRole == "PMO") {
      try {
        const conditions = [];
        for (const key in req.query) {
          const value = req.query[key];
          if (value !== "" && value !== undefined) {
            if (key == "Project_ID") {
              conditions.push(`${key} REGEXP '${value}$'`);
            } else if (key == "Owner") {
              conditions.push(` Milestone_Name in (select Milestone_Name from markup where Owner='${value}' union select Milestone_Name from subtask where Owner='${value}' union select Milestone_Name from task where Owner='${value}')`);
            } else {
              conditions.push(`${key} = '${value}'`);
            }
          }
        }
        const whereClause = conditions.length > 0 ? "AND " + conditions.join(" AND ") : "";
        const QC_List = await runQuery("SELECT * FROM `qc-portal`.checklist;");
        const users = await runQuery(
          'select Employee_ID,Full_Name,Role from users where Status="Active" order by Full_Name'
        );
        const milestones = await runQuery(
          `select *,DATE_FORMAT(Due_Date,'%Y-%m-%d') as f_Due_Date,DATE_FORMAT(QC_TGT_End_Date,'%Y-%m-%d') as f_QC_TGT_End_Date,DATE_FORMAT(QC_ACT_End_Date,'%Y-%m-%d') as f_QC_ACT_End_Date,
          DATE_FORMAT(Prod_TGT_Start_Date,'%c/%d/%y') as Prod_TGT_Start_Date,DATE_FORMAT(Prod_TGT_End_Date,'%c/%d/%y') as Prod_TGT_End_Date,DATE_FORMAT(QC_TGT_Start_Date,'%c/%d/%y') as QC_TGT_Start_Date,
          DATE_FORMAT(QC_TGT_End_Date,'%c/%d/%y') as QC_TGT_End_Date,DATE_FORMAT(QC_ACT_End_Date,'%c/%d/%y') as QC_ACT_End_Date,DATE_FORMAT(Due_Date,'%c/%d/%y') as Due_Date,DATE_FORMAT(Created_Date,'%c/%d/%y') as Created_Date from milestone where Created_By=?
          ${whereClause} order by Prod_TGT_End_Date asc`,
          [req.session.UserID]
        );
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
        next(error);
      }
    } else {
      res.redirect("/login");
    }
  });
  pmo_router.get("/milestone/:Customer/:ProjectID", (req, res) => {
    if (req.session.UserID && req.session.UserRole == "PMO") {
      db.query(
        'select Employee_ID,Full_Name from users where Status="Active" order by Full_Name ',
        (error, result) => {
          if (error) {
            console.log(error);
          } else {
            db.query(
              "select *,DATE_FORMAT(Planned_Start_Date,'%c/%d/%y') as n_Planned_Start_Date,DATE_FORMAT(Submission_Due_Date,'%c/%d/%y') as n_Submission_Due_Date,DATE_FORMAT(Created_Date,'%c/%d/%y') as n_Created_Date from milestone where Customer=? and Project_ID=?",
              [req.params.Customer, req.params.ProjectID],
              (error1, result1) => {
                if (error) {
                  console.log(error);
                } else {
                  res.render("../views/PMO/Milestone", {
                    userData: req.session.UserData,
                    Notifications: getNotification(req),
                    ProjectData: {
                      Customer: req.params.Customer,
                      Project_ID: req.params.ProjectID,
                    },
                    UserList: result,
                    Data: result1,
                  });
                }
              }
            );
          }
        }
      );
    } else {
      res.redirect("/login");
    }
  });

  pmo_router.post("/CreateMilestone/:Customer", async (req, res, next) => {
    const Customer = req.params.Customer;
    let milestoneName = "";
    let isBulkCreation = false;
    let id;
    if (req.session.UserID && req.session.UserRole == "PMO") {
      let formdata = req.body;
      let InvalidDateProjects = [],
        duplicateProject = [],
        rejectedProject = [];
      if (Array.isArray(formdata.Project_ID)) {
        isBulkCreation = true;
      }
      formdata.Project_ID = Array.isArray(formdata.Project_ID) ? formdata.Project_ID : [formdata.Project_ID];
      formdata.ID = Array.isArray(formdata.ID) ? formdata.ID : [formdata.ID];
      for (let i = 0; i < formdata.Project_ID.length; i++) {
        const projectID = formdata.Project_ID[i];
        id = formdata.ID[i];
        const project = {
          idProjects: id,
          Project_ID: projectID,
          Prod_TGT_Start_Date: formdata.Prod_TGT_Start_Date,
          Prod_TGT_End_Date: formdata.Prod_TGT_End_Date,
          QC_TGT_Start_Date: formdata.QC_TGT_Start_Date,
          QC_TGT_End_Date: formdata.QC_TGT_End_Date,
          Owner: formdata.Owner,
          Customer: Customer,
          Created_By: req.session.UserID,
          Created_Date: getTimeStamp(),
          Due_Date: formdata.Due_Date,
          City: formdata.City,
          Dot: formdata.Dot,
          Power: formdata.Power,
          County_1: formdata.County_1,
          County_2: formdata.County_2,
          Billing_Category: formdata.Billing_Category ? formdata.Billing_Category : "Billable"
        };
        const RestrictedStatus = ['Submitted - Awaiting Approval', 'Cancel', 'Re-Submitted - Awaiting Approval', 'Rejected', 'Reassigned', 'Approved']
        await getProjectDetails(Customer, id)
          .then(async (projectInfo) => {
            let ProjectDueDate = projectInfo.DueDate ? new Date(projectInfo.DueDate) : null;
            let ProjectReceivedDate = projectInfo.ReceivedDate ? new Date(projectInfo.ReceivedDate) : null;
            ProjectDueDate = (new Date(ProjectDueDate.setDate(ProjectDueDate.getDate() + 1)).toISOString().slice(0, 10));
            ProjectReceivedDate = (new Date(ProjectReceivedDate.setDate(ProjectReceivedDate.getDate() + 1)).toISOString().slice(0, 10));
            // if (RestrictedStatus.includes(projectInfo.Status)) {
            //   rejectedProject.push(projectID)
            //   return;
            // }
            if (formdata.DueDate < ProjectReceivedDate) {
              InvalidDateProjects.push(projectID)
              return;
            }
            milestoneName = `${project.Project_ID.slice(0, 1) + project.Project_ID.slice(-6)}-${formdata.Milestone_Name}`;
            let temp = await runQuery("Select count(*) as Count from milestone where Project_ID=? and Milestone_Name LIKE ?", [projectID, milestoneName + '%']);
            let Count = temp[0].Count;
            if (Count) {
              temp = await runQuery("Select * from milestone where Project_ID=? and Milestone_Name LIKE  ? and Milestone_Status not in ('Short-Closed','Approved','Submitted - Awaiting Approval')", [projectID, milestoneName + '%']);
              if (temp.length == 0) {
                milestoneName = milestoneName.concat("-", Count)
              }
            }
            project.Milestone_Name = milestoneName;
            await runQuery("insert into milestone set ?", [project])
              .then(async (data) => {
                let temp = await runQuery(
                  `update ${projectTableNames[Customer].Table} set Status=CASE WHEN Status IN ('WIP','Completed','Submitted - Awaiting Approval','Re-Submitted - Awaiting Approval','Rejected','Approved') THEN 'WIP' WHEN Status='YTA' THEN 'YTS' ELSE Status END where ${projectTableNames[Customer].ProjectColumn}=? and idProjects=?`,
                  [projectID, id]
                );
                await sendNotification(
                  project.Owner,
                  `New Milestone Assignment: ${project.Project_ID}_${project.Milestone_Name}`
                );
                runQuery("select * from users where Employee_ID=?", [
                  project.Owner,
                ]).then(async (data) => {
                  if (data.length > 0) {
                    await SendEmail(data[0].Email_ID, "", `New Milestone Assignment: ${project.Project_ID}_${project.Milestone_Name}`, `<div style="font-size:14px">
                <p>Dear <b>${data[0].Full_Name}</b>,</p>
                <p>Please be informed that the following new milestone has been assigned to you.</p>
                <hr>
                <p><b>Milestone Name: </b><a href='${encodeURI(getBaseURL(req) + '/ViewMilestone/' + Customer + '/' + project.idProjects + '/' + project.Milestone_Name)}'>${project.Milestone_Name}</a> </p>
                <p><b>Project ID: </b>${project.Project_ID}.</p>
                <hr>
                <p>Please review the requirements and take the necessary actions to ensure timely completion. If you have any questions, feel free to reach out to PMO. </p>
            </div>`
                    );
                  }
                });
              })
              .catch((er) => {
                if (er?.code == "ER_DUP_ENTRY") {
                  duplicateProject.push(projectID);
                } else {
                  rejectedProject.push(projectID);
                  console.log(er);
                }
              });
          })
          .catch((er) => {
            console.log(er)
            rejectedProject.push(projectID);
          });
      }
      if (duplicateProject.length > 0) {
        req.session.Notifications = JSON.stringify(
          new Notification(
            "Note..!",
            "This milestone are already exists for the following job(s)" +
            duplicateProject.join(","),
            "verified",
            "10s"
          )
        );
      } else if (InvalidDateProjects.length > 0) {
        req.session.Notifications = JSON.stringify(
          new Notification(
            "Error..!",
            "Milestone Due Date should not be greater than Project Due Date. So Milestone are not created for the following Job(s) " +
            InvalidDateProjects.join(","),
            "error",
            "10s"
          )
        );
      } else if (rejectedProject.length > 0) {
        req.session.Notifications = JSON.stringify(
          new Notification(
            "Error..!",
            "Something went wrong unable to create the milestones for the following project(s)." +
            rejectedProject.join(","),
            "error",
            "10s"
          )
        );
      } else {
        req.session.Notifications = JSON.stringify(
          new Notification(
            "Success..!",
            "All the Milestone are Created Successfully.",
            "success",
            "3s"
          )
        );
      }
      if (isBulkCreation || rejectedProject.length || InvalidDateProjects.length || duplicateProject.length) {
        return res.redirect(req.headers.referer);
      } else {
        return res.redirect(`/ViewMilestone/${Customer}/${id}/${milestoneName}`);
      }
    } else {
      return res.redirect("/");
    }
  });

  function getProjectDetails(Customer, ProjectID) {
    return new Promise((resolve, reject) => {
      db.query(
        `select * from ${projectTableNames[Customer].Table} where idProjects=?`,
        [ProjectID],
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result[0]);
          }
        }
      );
    });
  }
  pmo_router.post("/CreateTask/:Customer/:Milestone_Name", (req, res, next) => {
    let formData = req.body;
    formData.TaskName =
      formData.Type.slice(0, 3) + "-" + formData.Project_ID.slice(-5);
    formData.Created_Date = getTimeStamp();
    formData.Created_By = req.session.UserID;
    formData.Comments = "{}";
    db.query("insert into task set?", [formData], async (error, result) => {
      if (error) {
        if (error?.code == "ER_DUP_ENTRY") {
          req.session.Notifications = JSON.stringify(
            new Notification(
              "Error!",
              `${formData.TaskName} is an existing task.`,
              "error",
              "3s"
            )
          );
        } else {
          req.session.Notifications = JSON.stringify(
            new Notification(
              "Error!",
              "Something went wrong try again.",
              "error",
              "3s"
            )
          );
          next(error);
        }
      } else {
        await sendNotification(
          formData.Owner,
          `New Task "${formData.TaskName}" is assigned to you.`
        )
          .then((result) => {
            req.session.Notifications = JSON.stringify(
              new Notification(
                "Success..!",
                "Task Successfully Created.",
                "success",
                "2s"
              )
            );
          })
          .catch((e) => {
            next(e);
          });
      }
    });
    res.redirect(
      `/ViewMilestone/${req.params.Customer}/${req.params.Milestone_Name}`
    );
  });

  pmo_router.get("/ViewTask/:Customer/:Milestone_Name/:Task_Name",
    async (req, res, next) => {
      if (req.session.UserID && req.session.UserRole == "PMO") {
        try {
          const milestoneData = await runQuery(
            `SELECT M.*,DATE_FORMAT(M.Prod_TGT_Start_Date,'%c/%d/%y') as Prod_TGT_Start_Date,DATE_FORMAT(M.Prod_TGT_End_Date,'%c/%d/%y') as Prod_TGT_End_Date,DATE_FORMAT(M.Prod_ACT_Start_Date,'%c/%d/%y') as Prod_ACT_Start_Date,DATE_FORMAT(M.Prod_ACT_End_Date,'%c/%d/%y') as Prod_ACT_End_Date,DATE_FORMAT(M.QC_TGT_Start_Date,'%c/%d/%y') as QC_TGT_Start_Date,DATE_FORMAT(M.QC_TGT_End_Date,'%c/%d/%y') as QC_TGT_End_Date,DATE_FORMAT(M.QC_ACT_Start_Date,'%c/%d/%y') as QC_ACT_Start_Date,DATE_FORMAT(M.QC_ACT_End_Date,'%c/%d/%y') as QC_ACT_End_Date,P.* FROM milestone as M inner join ${projectTableNames[req.params.Customer].Table
            } as P where M.Project_ID=P.${projectTableNames[req.params.Customer].ProjectColumn
            } and M.Milestone_Name=?`,
            [req.params.Milestone_Name]
          );
          const users = await runQuery(
            'select Employee_ID,Full_Name from users where Status="Active" order by Full_Name'
          );
          const tasks = await runQuery(
            "select T.*,date_format(M.Prod_ACT_Start_Date,'%c/%d/%y') as Prod_ACT_Start_Date,date_format(M.Prod_ACT_End_Date,'%c/%d/%y') as Prod_ACT_End_Date,DATE_FORMAT(M.QC_ACT_Start_Date,'%c/%d/%y') as QC_ACT_Start_Date,DATE_FORMAT(M.QC_ACT_End_Date,'%c/%d/%y') as QC_ACT_End_Date from task  as T  inner join milestone as M where T.Milestone_Name=M.Milestone_Name  and T.Milestone_Name=? and T.TaskName=?",
            [req.params.Milestone_Name, req.params.Task_Name]
          );
          res.render("../views/PMO/Task", {
            userData: req.session.UserData,
            Notifications: getNotification(req),
            Milestone_Info: milestoneData[0],
            Owners: users,
            Task: tasks[0],
          });
        } catch (error) {
          next(error);
        }
      } else {
        res.redirect("/");
      }
    }
  );
  pmo_router.post("/UpdateProjectStatus/:Customer", async (req, res) => {
    let Data = req.body;
    Data.Project_ID = Array.isArray(Data.Project_ID) ? Data.Project_ID : [Data.Project_ID];
    Data.ID = Array.isArray(Data.ID) ? Data.ID : [Data.ID];
    let temp;
    for (let index = 0; index < Data.Project_ID.length; index++) {
      const element = Data.Project_ID[index];
      let Result = await runQuery("Select Customer from milestone where Project_ID=? and idProjects=?", [element, Data.ID[index]]);
      let Customer = Result.length > 0 ? Result[0].Customer : req.params.Customer;
      if (Customer != null || Customer != undefined) {
        Result = await runQuery(`Select * from ${projectTableNames[Customer].Table} where idProjects=?`, [Data.ID[index]]);
        let ReceivedDate = Result.length > 0 ? new Date(Result[0].ReceivedDate) : null;
        ReceivedDate = (new Date(ReceivedDate.setDate(ReceivedDate.getDate() + 1)).toISOString().slice(0, 10));
        let DueDate = Result.length > 0 ? new Date(Result[0].DueDate) : null;
        DueDate = (new Date(DueDate.setDate(DueDate.getDate() + 1)).toISOString().slice(0, 10));
        let StatusDate = Data.StatusDate ? Data.StatusDate : new Date().toISOString().slice(0, 10);
        if (Data.Status == "Submitted - Awaiting Approval") {
          if (ReceivedDate <= StatusDate) {
            await runQuery(`update ${projectTableNames[Customer].Table} set SubmittedDate=CASE WHEN SubmittedDate IS NULL THEN ? ELSE SubmittedDate END,Status=? where ${projectTableNames[Customer].ProjectColumn}=? and idProjects=?`, [StatusDate, Data.Status, element, Data.ID[index]]);
          } else {
            req.session.Notifications = JSON.stringify(
              new Notification(
                "Error!",
                "The Submitted Date should be on or after the Job Received date.",
                "error",
                "5s"
              )
            );
            break;
          }
        } else if (Data.Status == "Approved") {
          if (ReceivedDate <= StatusDate) {
            await runQuery(`update ${projectTableNames[Customer].Table} set ApprovedDate=CASE WHEN ApprovedDate IS NULL THEN ? ELSE ApprovedDate END,Status=? where ${projectTableNames[Customer].ProjectColumn}=? and idProjects=?`, [StatusDate, Data.Status, element, Data.ID[index]]);
          } else {
            req.session.Notifications = JSON.stringify(
              new Notification(
                "Error!",
                "Ensure the approved date is on or after the Job Received date.",
                "error",
                "5s"
              )
            );
            break;
          }
        } else {
          await runQuery(`update ${projectTableNames[Customer].Table} set Status=? where ${projectTableNames[Customer].ProjectColumn}=? and idProjects=?`, [Data.Status, element, Data.ID[index]]);
        }
        req.session.Notifications = JSON.stringify(
          new Notification(
            "Success...!",
            "Project status has been updated successfully",
            "success",
            "3s"
          )
        );
      } else {
        req.session.Notifications = JSON.stringify(
          new Notification(
            "Error!",
            "There is no milestone for few projects you cant update the status.",
            "error",
            "5s"
          )
        );
      }
    }
    res.redirect(req.headers.referer);
  });
  pmo_router.get("/RateCard", async (req, res) => {
    if (req.session.UserID && req.session.UserRole == "PMO" && req.session.Designation == "Head-OSP Design") {
      const RateCard = await runQuery("select * from ratecard");
      res.render("../views/PMO/RateCard", {
        userData: req.session.UserData,
        Notifications: getNotification(req),
        RateCard: RateCard
      });
    } else {
      res.send("Page Not Found")
    }
  })
  pmo_router.post("/AddEstimate", async (req, res) => {
    delete req.body.Description;
    delete req.body.UOM;
    req.body.Created_By = req.session.UserID;
    req.body.Created_Date = getTimeStamp();
    const unitPrice = await runQuery("Select UnitPrice from ratecard where idratecard=? and Status='Active'", [req.body.idratecard])
    req.body.UnitPrice = unitPrice[0].UnitPrice;
    runQuery("insert into estimates set ?", [req.body]).then(result => {
      req.session.Notifications = JSON.stringify(
        new Notification(
          "Success!",
          "Estimate added successfully.",
          "success",
          "3s"
        )
      );
      res.redirect(req.headers.referer);
    }).catch(er => {
      req.session.Notifications = JSON.stringify(
        new Notification(
          "Error!",
          "Internal Server Error.",
          "error",
          "3s"
        )
      );
      console.log(er)
      res.redirect(req.headers.referer);
    });
  });
  pmo_router.post("/AddWorkDone", async (req, res) => {
    delete req.body.Description;
    delete req.body.UOM;
    req.body.Created_By = req.session.UserID;
    req.body.Created_Date = getTimeStamp();
    const unitPrice = await runQuery("Select UnitPrice from ratecard where idratecard=? and Status='Active'", [req.body.idratecard])
    req.body.UnitPrice = unitPrice[0].UnitPrice;
    req.body.WorkedMonth = req.body.WorkedMonth.concat("-01")
    const existingEntry = await runQuery("select sum(Quantity) as totalExistingQty from monthlyworkdone where Job_ID=? and Item=?", [req.body.Job_ID, req.body.Item]);
    const totalExistingQty = existingEntry[0].totalExistingQty;
    const qty = Number(req.body.Quantity); // convert string to number

    // Scenario 1 — First entry cannot be negative
    if (totalExistingQty === null && qty < 0) {
      req.session.Notifications = JSON.stringify(
        new Notification(
          "Error!",
          "The first work done entry cannot be negative.",
          "error",
          "3s"
        )
      );
      return res.redirect(req.headers.referer);
    }

    // Scenario 2 — Negative entry must not exceed existing total
    if (qty < 0 && totalExistingQty + qty < 0) {
      req.session.Notifications = JSON.stringify(
        new Notification(
          "Error!",
          "This deduction cannot be applied because the total available quantity is not enough to offset the negative value.",
          "error",
          "5s"
        )
      );
      return res.redirect(req.headers.referer);
    }
    runQuery("insert into monthlyworkdone set ?", [req.body]).then(result => {
      req.session.Notifications = JSON.stringify(
        new Notification(
          "Success!",
          "Estimate added successfully.",
          "success",
          "3s"
        )
      );
      res.redirect(req.headers.referer);
    }).catch(er => {
      req.session.Notifications = JSON.stringify(
        new Notification(
          "Error!",
          "Internal Server Error.",
          "error",
          "3s"
        )
      );
      console.log(er)
      res.redirect(req.headers.referer);
    });
  });
  pmo_router.get("/CreditNote", async (req, res) => {
    const { InvoiceNumber,CreditNoteNumber } = req.query;
    const estimatesList = await runQuery("Select * from estimates where `Invoice Number`=? and Status=?", [InvoiceNumber, "Invoiced"])
    const groupedEst = estimatesList.reduce((result, item) => {
      if (!result[item.Job_ID]) result[item.Job_ID] = []
      result[item.Job_ID].push(item)
      return result
    }, {});
    const creditedLineItems = await runQuery(`SELECT e.*,
      u1.Full_Name AS creditNoteByName,
      u2.Full_Name AS invoiceMarkedByName
      FROM estimates AS e
      INNER JOIN users AS u1 
        ON u1.Employee_ID = e.creditNoteBy
      LEFT JOIN users AS u2 
        ON u2.Employee_ID = e.invoiceMarkedBy
      WHERE e.Status = ? AND ( ? IS NULL OR e.creditNoteNumber = ? )
      ORDER BY e.creditNoteOn DESC;
      `, ["Credit",CreditNoteNumber||null,CreditNoteNumber||null]);
    // const groupedCreditedLineItems = creditedLineItems.reduce((result, item) => {
    //   if (!result[item.Job_ID]) result[item.Job_ID] = []
    //   result[item.Job_ID].push(item)
    //   return result
    // }, {});
    const groupedCreditedLineItems = creditedLineItems.reduce((acc, item, i) => {
      const credit = item["creditNoteNumber"] ?? 'UNKNOWN_CREDIT'
      const invoice = item["Invoice Number"] ?? 'UNKNOWN_INVOICE'
      const job = item.Job_ID ?? 'UNKNOWN_JOB'
      acc[credit] ??= {}
      acc[credit][invoice] ??= {}
      acc[credit][invoice][job] ??= []
      acc[credit][invoice][job].push(item)
      return acc
    }, {})
    if (req.session.UserID && req.session.UserRole == "PMO" && req.session.Designation == "Head-OSP Design") {
      res.render("../views/PMO/CreditNote", {
        userData: req.session.UserData,
        Notifications: getNotification(req),
        estimatesList: groupedEst,
        InvoiceNumber: InvoiceNumber,
        CreditedLineItems: groupedCreditedLineItems
      });
    } else {
      res.redirect("/")
    }
  })
  pmo_router.get("*", (req, res) => {
    res.redirect("/NotFound");
  });
  return pmo_router;
};
// module.exports = pmo_router
