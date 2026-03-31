const express = require('express');
const passport = require('passport');
const session = require('express-session');
const db = require('./DataBaseConnection');
const Notification = require('./Notification');
const SendEmail = require('./Email');
const path = require("path");
const bodyParser = require('body-parser');
const fs = require('fs');
const { Server } = require('socket.io');
const multer = require('multer');
const https = require('https')
const router = express.Router();
const PDFGenerator = require('pdfkit');
const { PDFDocument, rgb, degrees } = require('pdf-lib');
const bcrypt = require('bcrypt');
const cors = require('cors');
const saltRounds = 11;
const morgan = require('morgan')
process.env.tz = 'Asia/Calcutta';
require('dotenv').config();
const app = express();
app.use(bodyParser.urlencoded({ limit: '1000mb', extended: true }));
app.use(bodyParser.json({ limit: '1000mb' }))
app.use(session({
  resave: false,
  saveUninitialized: true,
  secret: process.env.Secret_Key,
  cookie: { maxAge: 86400000 * 7, secure: true },
  name: "QGPMS-Production"
}));
app.use(cors({
  origin: true,
  credentials: true
}))
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});
app.use(passport.initialize())
app.use(passport.session())
app.use(express.json());

// log all requests to access.log
morgan.token('date', (req, res, tz) => {
  return getTimeStamp();
})
morgan.format('myformat', ':remote-addr | :date[Asia/Taipei] | :method | :url | :response-time ms');
app.use(morgan('myformat', {
  stream: fs.createWriteStream(path.join(__dirname, 'access.log'), { flags: 'a' })
}));

app.use(express.urlencoded({
  extended: true
}));
app.engine('html', require('ejs').renderFile);
app.set("view engine", "ejs");
app.use(express.static(`${__dirname}`));
app.use(express.static('public'))
app.use('/public', express.static('public'))
app.use('/mnt/nas', express.static('/mnt/nas'));
const privateKey = fs.readFileSync('key.pem');
const certificate = fs.readFileSync('cert.pem')
const credentials = { key: privateKey, cert: certificate, requestCertificate: false, rejectUnauthorized: false };
const httpsServer = https.createServer(credentials, app);
httpsServer.listen(process.env.PORT, () => {
  console.log('server is Running under Https with port:' + process.env.PORT)
});
var userProfile;

// Passport config
passport.serializeUser(function (user, cb) {
  cb(null, user);
});

passport.deserializeUser(function (obj, cb) {
  cb(null, obj);
});
// Google Auth
const GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "https://localhost:6500/auth/google/callback"
}, function (accessToken, refreshToken, profile, done) {
  userProfile = profile;
  return done(null, userProfile)
}))


// Socket IO Server
const io = new Server(httpsServer);

//Router Config
const api_router = require('./routes/api')(io);
const pmo_router = require('./routes/PMO')(io);
const manager_router = require('./routes/manager')(io);
const employee_router = require('./routes/employee')(io);
const admin_router = require('./routes/admin')(io);
const { runQuery, runTransaction } = require('./RunQuery');
const { AES } = require('crypto-js');
app.use('/api', api_router);
app.use('/PMO', pmo_router);
app.use('/Manager', manager_router);
app.use('/Employee', employee_router);
app.use('/Admin', admin_router);

app.use((err, req, res, next) => {
  const timestamp = new Date().toLocaleString();
  const url = req.originalUrl;
  const method = req.method;
  const headers = req.headers;
  const body = req.body;
  const errorMessage = err.message;
  const errorDetails = {
    timestamp,
    method,
    url,
    headers,
    body,
    message: errorMessage
  };
  const errorString = JSON.stringify(errorDetails, null, 2) + '\n';
  const errorFilePath = 'Error.log'

  fs.appendFile(errorFilePath, errorString, (err) => {
    if (err) {
      console.error('Error writing to file:', err);
    }
  });
  next(err);
});

//Setting up Storage Area
const myStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    var uploadDir = "./public/uploads/Trainer";
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  }, filename: function (req, file, cb) {
    cb(null, req.session.UserID + '_' + file.originalname + '_' + Date.now() + path.extname(file.originalname));
  }
});

//Function to upload single file with name myQCImage
const upload = multer({ storage: myStorage, limits: { fileSize: 500000 } }).single("myQCImage");
function getTimeStamp() {
  return (new Date().toLocaleString("en-CA", { timeZone: 'Asia/Kolkata' }).split(',')[0] + " " + new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false }))
}
function getNotification(req) {
  const Notifications = (req.session.Notifications) ? JSON.parse(req.session.Notifications) : null;
  req.session.Notifications = null;
  return Notifications;
}
function sendNotification(To, Content) {
  return new Promise((resolve, reject) => {
    const data = {
      Employee_Id: To,
      message: Content,
      created_at: getTimeStamp(),
    }
    io.emit(`notification-${To}`, Content);
    db.query('insert into notifications set?', [data], (error, result) => {
      (error) ? reject(error) : resolve(result);
    })
  });
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
function getBaseURL(req) {
  return (`${req.protocol}` + '://' + `${req.get('host')}`);
}
app.locals.getProjectDetails = (Customer, ProjectID) => {
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
// Define a helper function to convert seconds to minutes
app.locals.secondsToMinutes = seconds => {
  if (isNaN(seconds)) {
    return "0.0";
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds} min / ${hours}:${remainingMinutes < 10 ? '0' : ''}${remainingMinutes} hrs`;
};

app.locals.GetChecklist = (Customer, SOW) => {
  const ChecklistConfig = {
    ATX: {
      "Create Estimate": "EST_PACKAGE",
      "Submit Asbuilt": "SUBMIT_ABD",
      "Determine Permit": "DETERMINE_PERMIT",
      "Obtain Permit": "OBTAIN_PERMIT",
      "Design-HLD": "EPON-ACAD-HLD",
      "Design-LLD": "EPON-SNET-LLD",
      "BAU": "ATC-BAU"
    },
    SkyTec: {
      "Create Estimate": "SKY-ABD",
      "Submit Asbuilt": "SKY-EST",
    }
  }
  return ChecklistConfig[Customer] ? ChecklistConfig[Customer][SOW] ? ChecklistConfig[Customer][SOW] : null : null;
}
app.locals.compareDates = (due, Comp, status) => {
  let dueDate = new Date(due)
  let Today = Comp ? new Date(Comp) : new Date(`${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate()}`);
  const _MS_PER_DAY = 1000 * 60 * 60 * 24;
  // Discard the time and time-zone information.
  const dueUtc1 = Date.UTC(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const todayUtc2 = Date.UTC(Today.getFullYear(), Today.getMonth(), Today.getDate());
  let NoOfDays = Math.floor((dueUtc1 - todayUtc2) / _MS_PER_DAY);
  const completedStatus = ["IQC - Comp", "IQC-WIP", "Completed", "Ready for QC", "Submitted - Awaiting Approval", "Approved", "CQC", "CQC-YTS", "CQC-WIP", "CQC-Comp", "USQC", "USQC-YTS", "USQC-WIP", "USQC-Comp", "Short-Closed"];
  const workingStatus = ["YTA", "YTS", "YTS", "WIP"]
  if (workingStatus.includes(status)) {
    if (NoOfDays == 0) return "Due Today";
    if (NoOfDays == 1) return "Approaching Due Date";
    if (NoOfDays > 1) return "On Time";
    if ((NoOfDays < 0) && (NoOfDays >= -2)) return "Delayed";
    if (NoOfDays < -2) return "Escalation";
  } else if (completedStatus.includes(status)) {
    if (NoOfDays >= 0) return "On Time";
    if (NoOfDays < 0) return "Delayed";
  } else {
    return null;
  }
};

app.locals.formatDateString = (dateString) => {
  let dateParts = dateString.split('/');
  const formattedDate = dateParts.map(part => (part.length === 1 ? '0' + part : part)).join('-');
  return formattedDate;
}

function generateNaturalNumbersArray(limit) {
  const array = [];
  for (let i = 1; i <= limit; i++) {
    array.push(i);
  }
  return array;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

app.locals.generateShuffledNaturalNumbersArray = (limit) => {
  const array = generateNaturalNumbersArray(limit);
  return shuffleArray(array);
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
const getPendingTaskInfo = async (req) => {
  const activeSession = await runQuery("select * from timesheet where endTime is null and UserID=?", [req.session.UserID]);
  if (activeSession.length) {
    const taskName = activeSession[0].TaskName;
    let TaskInfo;
    if (taskName.startsWith("SUB")) {
      TaskInfo = await runQuery("select SubTaskName as TaskName from subtask where SubTaskName=?", [taskName]);
    } else if (taskName.startsWith("MKUP")) {
      TaskInfo = await runQuery("select Sub_Task_Name as TaskName from markup where Sub_Task_Name=?", [taskName])
    } else {
      TaskInfo = await runQuery("SELECT TaskName,TaskLabel,M.Milestone_Name,M.Customer FROM task T inner join milestone M where T.Milestone_Name=M.Milestone_Name and T.idProjects=M.idProjects and T.TaskName=?", [taskName])
    }
    return TaskInfo[0];
  }
}
const isValidCustomer = (Customer) => {
  return new Promise((resolve, reject) => {
    db.query("Select * from customers where Name=?", [Customer], (error, results) => {
      if (error) {
        reject({ error, params });
      } else {
        if (results.length > 0) {
          resolve(true);
        } else {
          reject(false);
        }
      }
    });
  });
};
io.on('connection', (socket) => {
  // console.log('User connected:', socket.id);
  // socket.on('Check_Employee_Exist', (data, callback) => {
  //   callback("Present")
  // })
  // socket.on('disconnect',()=>{
  //   console.log('User Disconnected:', socket.id);
  // })
  socket.on("getAllActiveStatus", async (data) => {
    let result = [];
    try {
      if (data.ResponseFor == "Project") {
        result = await runQuery(`select T.TaskID,DATE_FORMAT(timesheet.startTime,'%c-%d-%y %T') as startTime,TIMESTAMPDIFF(SECOND,timesheet.startTime,Now()) as Duration,Now(),T.Label,Milestone_Name,idProjects,users.Full_Name,users.Employee_ID,T.Project_ID  from(
        select TaskName as TaskID,TaskLabel as Label,Milestone_Name,idProjects,Owner,Project_ID from task where Milestone_Name in (select Milestone_Name from milestone where Customer="${data.Customer}" and idProjects="${data.idProjects}" and Project_ID="${data.Project}") union all
        select SubTaskName as TaskID,SubTaskLabel as Label,Milestone_Name,idProjects,Owner,Project_ID from subtask where Milestone_Name in (select Milestone_Name from milestone where Customer="${data.Customer}" and idProjects="${data.idProjects}" and Project_ID="${data.Project}") union all
        select Sub_Task_Name as TaskID,Sub_Task_Name as Label,Milestone_Name,idProjects,Owner,Project_ID from markup where Milestone_Name in (select Milestone_Name from milestone where Customer="${data.Customer}" and idProjects="${data.idProjects}" and Project_ID="${data.Project}"))as T inner join timesheet on T.TaskID=timesheet.TaskName inner join users on users.Employee_ID=T.Owner where timesheet.endTime is null;`)
        socket.emit("AllActiveStatus", { result: result, Customer: data.Customer });
      } else if (data.ResponseFor == "Milestone") {
        result = await runQuery(`select T.TaskID,DATE_FORMAT(timesheet.startTime,'%c-%d-%y %T') as startTime,TIMESTAMPDIFF(SECOND,timesheet.startTime,Now()) as Duration,Now(),T.Label,Milestone_Name,idProjects,users.Full_Name,users.Employee_ID,T.Project_ID  from(
            select TaskName as TaskID,TaskLabel as Label,Milestone_Name,idProjects,Owner,Project_ID from task where Milestone_Name="${data.Milestone_Name}" union all
            select SubTaskName as TaskID,SubTaskLabel as Label,Milestone_Name,idProjects,Owner,Project_ID from subtask where Milestone_Name="${data.Milestone_Name}" union all
            select Sub_Task_Name as TaskID,Sub_Task_Name as Label,Milestone_Name,idProjects,Owner,Project_ID from markup where Milestone_Name="${data.Milestone_Name}" ) as T inner join timesheet on T.TaskID=timesheet.TaskName inner join users on users.Employee_ID=T.Owner where timesheet.endTime is null;`)
        socket.emit("AllActiveStatus", { result: result, Customer: data.Customer });
      } else {
        let ActiveCustomers = Object.keys(projectTableNames);
        let tempArray;
        for (const Customer of ActiveCustomers) {
          tempArray = await runQuery(`select T.TaskID,DATE_FORMAT(timesheet.startTime,'%c-%d-%y %T') as startTime,TIMESTAMPDIFF(SECOND,timesheet.startTime,Now()) as Duration,Now(),T.Label,Milestone_Name,idProjects,users.Full_Name,users.Employee_ID,T.Project_ID  from(
                      select TaskName as TaskID,TaskLabel as Label,Milestone_Name,idProjects,Owner,Project_ID from task where Milestone_Name in (select Milestone_Name from milestone where Customer="${Customer}") union all
                      select SubTaskName as TaskID,SubTaskLabel as Label,Milestone_Name,idProjects,Owner,Project_ID from subtask where Milestone_Name in (select Milestone_Name from milestone where Customer="${Customer}") union all
                      select Sub_Task_Name as TaskID,Sub_Task_Name as Label,Milestone_Name,idProjects,Owner,Project_ID from markup where Milestone_Name in (select Milestone_Name from milestone where Customer="${Customer}")) as T inner join timesheet on T.TaskID=timesheet.TaskName inner join users on users.Employee_ID=T.Owner where timesheet.endTime is null order by Duration desc;`);
          tempArray.forEach(element => {
            element.Customer = Customer;
          });
          result = [...result, ...tempArray];
        }
        socket.emit("MasterTaskList", { result: result });
      }
      result.forEach((task) => {
        socket.emit("UpdateTaskStatus", { TaskName: task.TaskID, Active: true });
      });
    } catch (error) {
      console.log(error)
    }
  });
  socket.on("getActiveMilestoneStatus", async (data) => {
    let result = await runQuery(`select T.TaskID,DATE_FORMAT(timesheet.startTime,'%c-%d-%y %T') as startTime,TIMESTAMPDIFF(SECOND,timesheet.startTime,Now()) as Duration,Now(),T.Label,Milestone_Name,idProjects,users.Full_Name,users.Employee_ID,T.Project_ID  from(
        select TaskName as TaskID,TaskLabel as Label,Milestone_Name,idProjects,Owner,Project_ID from task where TaskName in (select TaskName from timesheet where endTime is null) union all
        select SubTaskName as TaskID,SubTaskLabel as Label,Milestone_Name,idProjects,Owner,Project_ID from subtask where SubTaskName in (select TaskName from timesheet where endTime is null) union all
        select Sub_Task_Name as TaskID,Sub_Task_Name as Label,Milestone_Name,idProjects,Owner,Project_ID from markup where Sub_Task_Name in (select TaskName from timesheet where endTime is null) ) as T inner join timesheet on T.TaskID=timesheet.TaskName inner join users on users.Employee_ID=T.Owner where timesheet.endTime is null;`)
    result.forEach((task) => {
      socket.emit("UpdateTaskStatus", { TaskName: task.TaskID, Active: true });
      socket.emit("UpdateMilestoneStatus", { Milestone_Name: task.Milestone_Name, Active: true });
      socket.emit("UpdateProjectStatus", { Project_ID: task.Project_ID, Active: true });
    });
  });
});
app.get('/', async (req, res) => {
  if (req.session.UserID) {
    const Notifications = (req.session.Notifications) ? JSON.parse(req.session.Notifications) : null;
    switch (req.session.UserRole) {
      case "Employee":
        res.redirect('/Employee');
        break;
      case "PMO":
        res.redirect('/PMO');
        break;
      case "Admin":
        res.redirect('/Admin');
        break;
      case "Manager":
        res.redirect('/Manager');
        break;
      default:
        req.session.Notifications = null;
        res.render('Login', { Notifications: Notifications });
        break;
    }
  } else {
    res.redirect('/login')
  }
});

app.get('/login', async (req, res) => {
  const Notifications = (req.session.Notifications) ? JSON.parse(req.session.Notifications) : null;
  if (req.session.UserID) {
    switch (req.session.UserRole) {
      case "Employee":
        res.redirect('/Employee');
        break;
      case "PMO":
        res.redirect('/PMO');
        break;
      case "Admin":
        res.redirect('/Admin');
        break;
      case "Manager":
        res.redirect('/Manager');
        break;
      default:
        req.session.Notifications = null;
        res.render('Login', { Notifications: Notifications });
        break;
    }
  } else {
    req.session.Notifications = null;
    res.render('Login', { Notifications: Notifications });
  }
});

app.post('/login', (req, res) => {
  let UserInfo = req.body;
  UserInfo.UserName = UserInfo.UserName.replace(" ", "")
  db.query("select *,DATE_FORMAT(Lastseen,'%c/%d/%y') as n_Lastseen from users where Employee_ID=? and status='Active'", [UserInfo.UserName], function (error, result) {
    if (error) {
      console.log(error)
    }
    else if (result.length > 0) {
      bcrypt.compare(UserInfo.key, result[0].Password).then(function (flag) {
        if (flag) {
          db.query("update users set LastSeen=? where Employee_ID=?", [getTimeStamp(), result[0].Employee_ID], function (error, result1) {
            if (error) console.log(error);
          });
          req.session.UserData = result[0];
          req.session.UserID = result[0].Employee_ID;
          const temp = new Notification('Success..!', 'Login Successful.', 'success', '2s');
          req.session.Notifications = JSON.stringify(temp);
          req.session.UserRole = result[0].Role;
          req.session.UserName = result[0].Full_Name;
          req.session.Designation = result[0].Designation;
          if (result[0].Role == "Employee") {
            res.redirect('/Employee');
          } else if (result[0].Role == "PMO") {
            res.redirect('/PMO');
          } else if (result[0].Role == "Admin") {
            res.redirect('/Admin');
          } else if (result[0].Role == "Manager") {
            res.redirect('/Manager');
          } else {
            return res.send("Internal Server Error");
          }
        } else {
          const temp = new Notification('Error..!', 'Incorrect Password', 'error', '2s');
          req.session.Notifications = JSON.stringify(temp);
          return res.redirect('/');
        }
      }).catch(err => {
        console.log(err);
      })
    } else {
      const temp = new Notification('Error..!', 'Incorrect Employee-ID', 'error', '2s');
      req.session.Notifications = JSON.stringify(temp);
      return res.redirect('/');
    }
  })
});

app.get('/Projects/:Customer/:Project_Name', async (req, res, next) => {
  if (req.session.UserID) {
    isValidCustomer(req.params.Customer).then(async isCustomer => {
      const Table = projectTableNames[req.params.Customer].Table;
      const PrimaryColumn = projectTableNames[req.params.Customer].ProjectColumn;
      const MilestoneOwner = await runQuery('select Employee_ID,Full_Name from users where Role="PMO" or Role="Manager"');
      const Project = await runQuery(`select *,DATE_FORMAT(ReceivedDate,'%c/%d/%y') as n_ReceivedDate, DATE_FORMAT(DueDate,'%c/%d/%y') as n_DueDate,DATE_FORMAT(ApprovedDate,'%c/%d/%y') as n_ApprovedDate from ${Table} where ${PrimaryColumn}=?`, [req.params.Project_Name]);
      const Log = await runQuery("select * from timesheet where TaskName in ( select TaskName from task where Project_ID='?' union select Sub_Task_Name from markup where Project_ID='?')", [req.params.Project_Name, req.params.Project_Name]);
      res.render('../views/PMO/Project-List', { Customer: req.params.Customer, Data: Project, Owners: MilestoneOwner, userData: req.session.UserData, Notifications: getNotification(req), Log: Log });
    }).catch(er => {
      res.redirect("/NotFound")
    })
  } else {
    res.redirect('/login');
  }
});

app.get("/Project/:Customer/:Project/:ID", async (req, res, next) => {
  if (req.session.UserID) {
    try {
      // const QC_List = await runQuery("SELECT * FROM `qc-portal`.checklist where Customer=?", [req.params.Customer]);
      const users = await runQuery("select Employee_ID,Full_Name,Role from users where Status='Active' order by Full_Name");
      //const ProjectData = await runQuery(`select *,DATE_FORMAT(ReceivedDate,'%c/%d/%y') as ReceivedDate, DATE_FORMAT(DueDate,'%c/%d/%y') as DueDate,DATE_FORMAT(SubmittedDate,'%c/%d/%y') as SubmittedDate,DATE_FORMAT(ApprovedDate,'%c/%d/%y') as ApprovedDate from ${projectTableNames[req.params.Customer].Table} where ${projectTableNames[req.params.Customer].ProjectColumn}=? and SOW=?`, [req.params.ID,req.params.SOW]);
      const ProjectData = await runQuery(`select *,DATE_FORMAT(ReceivedDate,'%c/%d/%y') as ReceivedDate, DATE_FORMAT(DueDate,'%c/%d/%y') as DueDate,DATE_FORMAT(SubmittedDate,'%c/%d/%y') as SubmittedDate,DATE_FORMAT(ApprovedDate,'%c/%d/%y') as ApprovedDate from ${projectTableNames[req.params.Customer].Table} where idProjects=?`, [req.params.ID]);
      if (!ProjectData.length) {
        return res.redirect("/NotFound")
      }
      let Program = ["MasTec-Windstream","MasTec-Comcast"].includes(ProjectData[0].Program)? ProjectData[0].Program : req.params.Customer;
      const QC_List = await runQuery("SELECT * FROM `qc-portal`.checklist where Customer=?", [Program]);
      const tasks = await runQuery(`select users.Full_Name,T.*,date_format(T.StartDate,'%c/%d/%y') as StartDate,date_format(T.DueDate,'%c/%d/%y') as DueDate,
        date_format(T.EndDate,'%c/%d/%y') as EndDate,DATE_FORMAT(T.DueDate,'%Y-%m-%d') as f_DueDate,DATE_FORMAT(T.EndDate,'%Y-%m-%d') as f_EndDate, QC.TaskLabel as Production_Name 
        from task  as T inner join users on users.Employee_ID=T.Owner  left join task as QC on QC.TaskName=T.Prod_Task 
        where T.Project_ID=? and T.idProjects=?`, [req.params.Project, req.params.ID]);

      const milestoneData = await runQuery(`select users.Full_Name,milestone.*,
    date_format(Prod_TGT_Start_Date,'%c/%d/%y') as Prod_TGT_Start_Date,
    date_format(Prod_ACT_Start_Date,'%c/%d/%y') as Prod_ACT_Start_Date,
    date_format(Prod_TGT_End_Date,'%c/%d/%y') as Prod_TGT_End_Date,
    date_format(Prod_ACT_End_Date,'%c/%d/%y') as Prod_ACT_End_Date,
    DATE_FORMAT(QC_ACT_Start_Date,'%c/%d/%y') as QC_ACT_Start_Date,
    DATE_FORMAT(QC_ACT_End_Date,'%c/%d/%y') as QC_ACT_End_Date,
    DATE_FORMAT(QC_TGT_Start_Date,'%c/%d/%y') as QC_TGT_Start_Date,
    DATE_FORMAT(QC_TGT_End_Date,'%c/%d/%y') as QC_TGT_End_Date, 
    DATE_FORMAT(Due_Date,'%c/%d/%y') as Due_Date,
    DATE_FORMAT(Due_Date,'%Y-%m-%d') as f_Due_Date,
    DATE_FORMAT(QC_TGT_End_Date,'%Y-%m-%d') as f_QC_TGT_End_Date
      from milestone inner join users on milestone.Owner=users.Employee_ID where idProjects=? and Project_ID=? and Customer=?`, [req.params.ID, req.params.Project, req.params.Customer]);
      const markup = await runQuery(`select users.Full_Name,markup.*,date_format(DueDate,'%c/%d/%y') as DueDate,date_format(StartDate,'%c/%d/%y') as StartDate,date_format(EndDate,'%c/%d/%y') as EndDate,
        DATE_FORMAT(DueDate,'%Y-%m-%d') as f_DueDate,DATE_FORMAT(EndDate,'%Y-%m-%d') as f_EndDate
         from markup join users where users.Employee_ID=markup.Owner and Project_ID=? and idProjects=?`, [req.params.Project, req.params.ID]);
      //const Log = await runQuery("select *,DATE_FORMAT(startTime,'%c-%d-%y %T') as startTime,DATE_FORMAT(endTime,'%c-%d-%y %T') as endTime from timesheet where TaskName in ( select TaskName from task where Project_ID=? and idProjects=? union select Sub_Task_Name from markup where Project_ID=? and idProjects=? union select SubTaskName from subtask where Project_ID=? and idProjects=?)", [req.params.Project, req.params.ID, req.params.Project, req.params.ID, req.params.Project, req.params.ID]);
      // const Log = await runQuery("SELECT t.*,u.Full_Name,coalesce(tsk.TaskLabel,sub.SubTaskLabel) as TaskLabel,coalesce(tsk.Milestone_Name,sub.Milestone_Name,mkup.Milestone_Name) as Milestone_Name,DATE_FORMAT(t.startTime,'%c-%d-%y %T') as startTime,DATE_FORMAT(t.endTime,'%c-%d-%y %T') as endTime FROM timesheet as t left join users as u on u.Employee_ID=t.UserID left join task as tsk on t.TaskName=tsk.TaskName  left join subtask as sub on sub.SubTaskName=t.TaskName left join markup as mkup on mkup.Sub_Task_Name=t.TaskName where t.TaskName in ( select TaskName from task where Project_ID=? and idProjects=? union select Sub_Task_Name from markup where Project_ID=? and idProjects=? union select SubTaskName from subtask where Project_ID=? and idProjects=?)", [req.params.Project, req.params.ID, req.params.Project, req.params.ID, req.params.Project, req.params.ID]);
      const Log = await runQuery(`
        SELECT 
            t.*, 
            u.Full_Name, 
            COALESCE(tsk.TaskLabel, sub.SubTaskLabel) AS TaskLabel, 
            COALESCE(tsk.Milestone_Name, sub.Milestone_Name, mkup.Milestone_Name) AS Milestone_Name, 
            DATE_FORMAT(t.startTime, '%c-%d-%y %T') AS startTime, 
            DATE_FORMAT(t.endTime, '%c-%d-%y %T') AS endTime 
        FROM timesheet AS t
        LEFT JOIN users AS u ON u.Employee_ID = t.UserID
        LEFT JOIN task AS tsk ON t.TaskName = tsk.TaskName
        LEFT JOIN subtask AS sub ON sub.SubTaskName = t.TaskName
        LEFT JOIN markup AS mkup ON mkup.Sub_Task_Name = t.TaskName
        INNER JOIN (
            SELECT DISTINCT TaskName FROM task WHERE Project_ID = ? AND idProjects = ? 
            UNION 
            SELECT DISTINCT Sub_Task_Name FROM markup WHERE Project_ID = ? AND idProjects = ? 
            UNION 
            SELECT DISTINCT SubTaskName FROM subtask WHERE Project_ID = ? AND idProjects = ?
        ) AS valid_tasks ON t.TaskName = valid_tasks.TaskName;
    `, [
        req.params.Project, req.params.ID,
        req.params.Project, req.params.ID,
        req.params.Project, req.params.ID
      ]);
      let Comments = JSON.parse(ProjectData[0].Note)
      const Subtask = await runQuery(`select users.Full_Name,subtask.*,date_format(StartDate,'%c/%d/%y') as StartDate,date_format(EndDate,'%c/%d/%y') as EndDate,
        date_format(subtask.Due_Date,'%c/%d/%y') as DueDate,DATE_FORMAT(subtask.Due_Date,'%Y-%m-%d') as f_DueDate,DATE_FORMAT(subtask.EndDate,'%Y-%m-%d') as f_EndDate,
        milestone.Customer as Customer from subtask inner join milestone on subtask.Milestone_Name=milestone.Milestone_Name left join users on users.Employee_ID=subtask.Owner where subtask.idProjects=? and subtask.Project_ID=?`, [req.params.ID, req.params.Project])
      // let MilestoneNameList = await runQuery("SELECT * FROM customers where Name=?", [req.params.Customer]);
      let program = ["MasTec-Windstream","MasTec-Comcast"].includes(ProjectData[0].Program) ? ProjectData[0].Program : req.params.Customer;
      let MilestoneNameList = await runQuery("SELECT * FROM customers where Name=?", [program]);
      MilestoneNameList = (MilestoneNameList.length && MilestoneNameList[0].Milestone) ? MilestoneNameList[0].Milestone.split(",") : null;

      const ProjectDuration = await runQuery(`select sum(TotalTime) as TotalTime from ((select sum(TotalTime) as TotalTime from subtask  where Project_ID=? and idProjects=?) 
      union all select sum(TotalTime) as TotalTime from markup where Task_Name in (select SubTaskName from subtask where Project_ID=? and idProjects=?)
      union all select sum(TotalTime) as TotalTime from markup where Task_Name in (select TaskName from task where Project_ID=? and idProjects=?)
      union all select sum(TotalTime) as TotalTime from task where Project_ID=? and idProjects=?) as ProjectTotalTime`, [req.params.Project, req.params.ID, req.params.Project, req.params.ID, req.params.Project, req.params.ID, req.params.Project, req.params.ID])
      const attachments = await runQuery("SELECT A.*,date_format(A.Created_Date,'%c/%d/%y') as Created_Date,U.Full_Name FROM attachments as A inner join users as U on A.Owner=U.Employee_ID where A.Project=?", [req.params.Project])
      let results = await runQuery("SELECT A.*,S.Task_Name,S.SubTaskLabel as Task,U.Full_Name,date_format(A.Created_Date,'%c/%d/%y') as Created_Date FROM attachments as A left join subtask as S on S.SubTaskName=A.TaskID left join users U on U.Employee_ID=A.Owner where A.Project=? and A.Status='Active'", [req.params.Project])
      const hierarchy = {};
      for (let row of results) {
        const project = row.Project;
        const milestone = row.Milestone;
        let task = row.TaskID;
        let subtask = "";
        let temp = "";
        const category = row.Category;
        let ParentTask = row.ParentTask;
        const attachment = { name: row.Name, path: row.path, Type: row.Type, Owner: row.Owner, OwnerName: row.Full_Name, Size: row.Size, Created_Date: row.Created_Date, ID: row.idattachments, category: category };

        // Initialize project
        if (!hierarchy[project]) {
          hierarchy[project] = { attachments: [], milestones: {} };
        }

        // Handle project-level attachments
        if (category === 'Project') {
          hierarchy[project].attachments.push(attachment);
          continue;
        }

        // Initialize milestone
        if (!hierarchy[project].milestones[milestone]) {
          hierarchy[project].milestones[milestone] = { attachments: [], tasks: {} };
        }

        // Handle milestone-level attachments
        if (category.startsWith("Milestone")) {
          hierarchy[project].milestones[milestone].attachments.push(attachment);
          continue;
        }

        // Initialize task
        if (category === 'Task') {
          if (!hierarchy[project].milestones[milestone].tasks[task]) {
            hierarchy[project].milestones[milestone].tasks[task] = { attachments: [], subtasks: {}, markup: {} };
          }
          hierarchy[project].milestones[milestone].tasks[task].attachments.push(attachment);
        }

        // Initialize subtask
        if (category === 'Subtask') {
          temp = await runQuery("Select * from subtask where SubTaskName=?", [task]);
          if (temp.length && temp[0].Prod_Sub_Task) {
            let parentSubtask = await runQuery("Select * from subtask where SubTaskName=?", [temp[0].Prod_Sub_Task]);
            ParentTask = parentSubtask[0].Task_Name;
            if (!hierarchy[project].milestones[milestone].tasks[ParentTask]) {
              hierarchy[project].milestones[milestone].tasks[ParentTask] = { attachments: [], subtasks: {}, markup: {} };
            }
            if (!hierarchy[project].milestones[milestone].tasks[ParentTask].subtasks[parentSubtask[0].SubTaskName]) {
              hierarchy[project].milestones[milestone].tasks[ParentTask].subtasks[parentSubtask[0].SubTaskName] = { attachments: [], subtasks: {}, markup: {} };
            }
            if (!hierarchy[project].milestones[milestone].tasks[ParentTask].subtasks[parentSubtask[0].SubTaskName].subtasks[task]) {
              hierarchy[project].milestones[milestone].tasks[ParentTask].subtasks[parentSubtask[0].SubTaskName].subtasks[task] = { attachments: [], subtasks: {}, markup: {} };
            }
            hierarchy[project].milestones[milestone].tasks[ParentTask].subtasks[parentSubtask[0].SubTaskName].subtasks[task].attachments.push(attachment);
            continue;
          } else {
            if (!hierarchy[project].milestones[milestone].tasks[ParentTask]) {
              hierarchy[project].milestones[milestone].tasks[ParentTask] = { attachments: [], subtasks: {}, markup: {} };
            }
            if (!hierarchy[project].milestones[milestone].tasks[ParentTask].subtasks[task]) {
              hierarchy[project].milestones[milestone].tasks[ParentTask].subtasks[task] = { attachments: [], subtasks: {}, markup: {} };
            }
            hierarchy[project].milestones[milestone].tasks[ParentTask].subtasks[task].attachments.push(attachment);
            continue;
          }
        }
        // Initialize markup
        if (category === 'Markup') {
          let markupInfo = await runQuery("Select * from markup where Sub_Task_Name=?", [task]);
          if (markupInfo.length) {
            if (markupInfo[0].MarkupFor == "Subtask") {
              let MainTask = await runQuery("select * from subtask where SubTaskName=?", [markupInfo[0].Task_Name]);
              if (MainTask.length && MainTask[0].Prod_Sub_Task) {
                let temp = await runQuery("select * from subtask where SubTaskName=?", [MainTask[0].Prod_Sub_Task]);// Get Actual Production Task
                if (temp.length) {
                  ParentTask = temp[0].Task_Name
                  if (!hierarchy[project].milestones[milestone].tasks[ParentTask]) {
                    hierarchy[project].milestones[milestone].tasks[ParentTask] = { attachments: [], subtasks: {}, markup: {} };
                  }
                  if (!hierarchy[project].milestones[milestone].tasks[ParentTask].subtasks[MainTask[0].Prod_Sub_Task]) {
                    hierarchy[project].milestones[milestone].tasks[ParentTask].subtasks[MainTask[0].Prod_Sub_Task] = { attachments: [], subtasks: {}, markup: {} };
                  }
                  if (!hierarchy[project].milestones[milestone].tasks[ParentTask].subtasks[MainTask[0].Prod_Sub_Task].subtasks[MainTask[0].SubTaskName]) {
                    hierarchy[project].milestones[milestone].tasks[ParentTask].subtasks[MainTask[0].Prod_Sub_Task].subtasks[MainTask[0].SubTaskName] = { attachments: [], markup: {} };
                  }
                  if (!hierarchy[project].milestones[milestone].tasks[ParentTask].subtasks[MainTask[0].Prod_Sub_Task].subtasks[MainTask[0].SubTaskName].markup[task]) {
                    hierarchy[project].milestones[milestone].tasks[ParentTask].subtasks[MainTask[0].Prod_Sub_Task].subtasks[MainTask[0].SubTaskName].markup[task] = { attachments: [], markup: {} };
                  }
                  hierarchy[project].milestones[milestone].tasks[ParentTask].subtasks[MainTask[0].Prod_Sub_Task].subtasks[MainTask[0].SubTaskName].markup[task].attachments.push(attachment);
                }
              } else if (MainTask.length) {
                ParentTask = MainTask[0].Task_Name
                if (!hierarchy[project].milestones[milestone].tasks[ParentTask]) {
                  hierarchy[project].milestones[milestone].tasks[ParentTask] = { attachments: [], subtasks: {}, markup: {} };
                }
                if (!hierarchy[project].milestones[milestone].tasks[ParentTask].subtasks[markupInfo[0].Task_Name]) {
                  hierarchy[project].milestones[milestone].tasks[ParentTask].subtasks[markupInfo[0].Task_Name] = { attachments: [], subtasks: {}, markup: {} };
                }
                if (!hierarchy[project].milestones[milestone].tasks[ParentTask].subtasks[markupInfo[0].Task_Name].markup[task]) {
                  hierarchy[project].milestones[milestone].tasks[ParentTask].subtasks[markupInfo[0].Task_Name].markup[task] = { attachments: [] };
                }
                hierarchy[project].milestones[milestone].tasks[ParentTask].subtasks[markupInfo[0].Task_Name].markup[task].attachments.push(attachment);
              }
            } else {
              ParentTask = markupInfo[0].Task_Name
              if (!hierarchy[project].milestones[milestone].tasks[ParentTask]) {
                hierarchy[project].milestones[milestone].tasks[ParentTask] = { attachments: [], subtasks: {}, markup: {} };
              }
              if (!hierarchy[project].milestones[milestone].tasks[ParentTask].markup[task]) {
                hierarchy[project].milestones[milestone].tasks[ParentTask].markup[task] = { attachments: [] };
              }
              hierarchy[project].milestones[milestone].tasks[ParentTask].markup[task].attachments.push(attachment);
            }
          }
        }
      };
      const RateCard = await runQuery("select * from ratecard where Status='Active' and Program=?", [ProjectData[0].Program]);
      const Estimates = await runQuery("select E.*,DATE_FORMAT(E.ApprovedDate,'%c/%d/%y') as ApprovedDate,DATE_FORMAT(E.`Invoiced Date`,'%c/%d/%y') as `Invoiced_Date`,DATE_FORMAT(E.`Payment Received Date`,'%c/%d/%y') as `Payment Received Date`,DATE_FORMAT(E.`Rejected Date`,'%c/%d/%y') as `Rejected Date`,DATE_FORMAT(E.`creditNoteDate`,'%Y-%m-%d') as `creditNoteDate`, R.Description,R.UOM,R.Region from estimates as E join ratecard as R on R.idratecard=E.idratecard where Job_ID=? and idProject=? order by CASE WHEN E.Status = 'Payment Received' THEN 1 ELSE 0  END, E.idestimates desc", [req.params.Project, req.params.ID]);
      const MonthlyWorkdone = await runQuery("select M.*,DATE_FORMAT(M.WorkedMonth, '%M-%y') AS month_year,R.Description,R.UOM,R.Region from monthlyworkdone as M join ratecard as R on R.idratecard=M.idratecard where M.Job_ID=? and M.idProject=? order by (M.MovedToEstimate = 'Yes'), M.Item,M.WorkedMonth DESC", [req.params.Project, req.params.ID]);
      const Region = await runQuery("SELECT distinct(Region) FROM ratecard");
      req.session.attachmentsInput = {
        "Project_ID": ProjectData[0].CFAS_ID ? ProjectData[0].CFAS_ID : ProjectData[0].JOB_ID,
        "Customer": req.params.Customer,
        "Category": "Project"
      }
      res.render('../views/PMO/Project', { userData: req.session.UserData, Notifications: getNotification(req), ProjectData: ProjectData[0], Task: tasks, subtask: Subtask, Milestone: milestoneData, Owners: users, QC_List: QC_List, markup: markup, Log: Log, Customer: req.params.Customer, Comments: Comments, MilestoneNameList: MilestoneNameList, ProjectTotalTime: ProjectDuration[0].TotalTime, attachments: attachments, hierarchy: hierarchy, RateCard: RateCard, Estimates: Estimates, Region: Region,MonthlyWorkdone:MonthlyWorkdone });
    } catch (error) {
      console.log(error);
      res.status(400).json(error);
    }
  } else {
    res.redirect('/')
  }
});

app.get('/ViewMilestone/:Customer/:ID/:Milestone_Name', async (req, res, next) => {
  if (req.session.UserID) {
    try {
      let Engineers = {
        Production_Time: 0,
        QC_Time: 0,
      };
      const milestoneData = await runQuery(`SELECT M.*,M.Owner as Milestone_Owner,DATE_FORMAT(M.Prod_TGT_Start_Date,'%c/%d/%y') as Prod_TGT_Start_Date,DATE_FORMAT(M.Prod_TGT_Start_Date,'%Y/%c/%d') as n_Prod_TGT_Start_Date,
      DATE_FORMAT(M.Prod_TGT_End_Date,'%c/%d/%y') as Prod_TGT_End_Date,DATE_FORMAT(M.Prod_ACT_Start_Date,'%c/%d/%y') as Prod_ACT_Start_Date, DATE_FORMAT(M.Prod_TGT_End_Date,'%Y/%c/%d') as n_Prod_TGT_End_Date,
      DATE_FORMAT(M.Prod_ACT_End_Date,'%c/%d/%y') as Prod_ACT_End_Date,DATE_FORMAT(M.QC_TGT_Start_Date,'%c/%d/%y') as QC_TGT_Start_Date,DATE_FORMAT(M.QC_TGT_Start_Date,'%Y/%c/%d') as n_QC_TGT_Start_Date,
      DATE_FORMAT(M.QC_TGT_End_Date,'%c/%d/%y') as QC_TGT_End_Date,DATE_FORMAT(M.QC_ACT_Start_Date,'%c/%d/%y') as QC_ACT_Start_Date,DATE_FORMAT(M.QC_TGT_End_Date,'%Y/%c/%d') as n_QC_TGT_End_Date,
      DATE_FORMAT(M.QC_ACT_End_Date,'%c/%d/%y') as QC_ACT_End_Date,DATE_FORMAT(M.Due_Date,'%c/%d/%y') as Due_Date,DATE_FORMAT(M.Submitted_Date,'%c/%d/%y') as Submitted_Date,
      DATE_FORMAT(M.Approved_Date,'%c/%d/%y') as Approved_Date, DATE_FORMAT(M.Due_Date,'%Y/%c/%d') as n_Due_Date,DATE_FORMAT(M.Approved_Date,'%Y/%c/%d') as n_Approved_Date,
      DATE_FORMAT(M.Submitted_Date,'%Y/%c/%d') as n_Submitted_Date, DATE_FORMAT(M.Created_Date,'%c/%d/%y') as Created_Date, P.*,P.Owner as Project_Owner,users.Full_Name
      FROM milestone as M inner join ${projectTableNames[req.params.Customer].Table} as P  on M.Project_ID=P.${projectTableNames[req.params.Customer].ProjectColumn} left join users on users.Employee_ID=M.Owner where M.Milestone_Name=? and 
      M.idProjects=P.idProjects and P.idProjects=?`, [req.params.Milestone_Name, req.params.ID]);
      if (!milestoneData.length) {
        return res.redirect("/NotFound")
      }
      const Production = await runQuery("SELECT Owner,TotalTime,Iteration,Score FROM task WHERE Type='Production' and Milestone_Name =? and idProjects=?", [req.params.Milestone_Name, req.params.ID]);
      Production.forEach(entry => {
        Engineers.Production_Time += entry.TotalTime
      })
      if (Production.length) {
        Engineers.Production_Engineers = Production[0].Owner ? Production[0].Owner : '';
        //Engineers.Production_Time = Production[0].TotalTime ? Production[0].TotalTime : 0;
        Engineers.Production_Score = Production[0].Score ? Production[0].Score : 0;
        Engineers.Production_Iteration = Production[0].Iteration ? Production[0].Iteration : 0;
      }
      const QC = await runQuery("SELECT Owner,TotalTime,Iteration,Score FROM task WHERE Type in ('IQC','RQC','CQC','USQC') and Milestone_Name=? and idProjects=?", [req.params.Milestone_Name, req.params.ID]);
      QC.forEach(entry => {
        Engineers.QC_Time += entry.TotalTime
      })
      if (QC.length) {
        Engineers.QC_Engineers = QC[0].Owner ? QC[0].Owner : '';
        // Engineers.QC_Time = QC[0].TotalTime ? QC[0].TotalTime : 0;
        Engineers.QC_Iteration = QC[0].Iteration ? QC[0].Iteration : 0;
        Engineers.QC_Score = QC[0].Score ? QC[0].Score : 0;
      }
      let MilestoneTotalTime = await runQuery("select sum(TotalTime) as TotalTime from ((select sum(TotalTime) as TotalTime from subtask  where Milestone_Name=? and Type='Production') union all select sum(TotalTime) as TotalTime from markup where Task_Name in (select SubTaskName from subtask where Type='Production' and Milestone_Name=?) union all select sum(TotalTime) as TotalTime from task where Milestone_Name=? and Type='Production') as MilestoneTotalTime", [req.params.Milestone_Name, req.params.Milestone_Name, req.params.Milestone_Name]);
      const MilestoneTotalProductionTime = MilestoneTotalTime[0].TotalTime;
      MilestoneTotalTime = await runQuery("select sum(TotalTime) as TotalTime from ((select sum(TotalTime) as TotalTime from subtask  where Milestone_Name=? and Type!='Production') union all select sum(TotalTime) as TotalTime from markup where Task_Name in (select SubTaskName from subtask where Type!='Production' and Milestone_Name=?) union all select sum(TotalTime) as TotalTime from task where Milestone_Name=? and Type!='Production') as MilestoneTotalTime", [req.params.Milestone_Name, req.params.Milestone_Name, req.params.Milestone_Name]);
      const MilestoneTotalQCTime = MilestoneTotalTime[0].TotalTime;
      const users = await runQuery('select Employee_ID,Full_Name,Role from users where Status="Active" order by Full_Name');
      const tasks = await runQuery("select T.*,P.TaskLabel as Production_Name,date_format(T.StartDate,'%c/%d/%y') as F_StartDate,date_format(T.EndDate,'%c/%d/%y') as F_EndDate,date_format(T.DueDate,'%c/%d/%y') as F_DueDate,DATE_FORMAT(T.DueDate,'%Y-%m-%d') as ff_DueDate,DATE_FORMAT(T.EndDate,'%Y-%m-%d') as ff_EndDate,users.Full_Name from task as T left join task as P on T.Prod_Task=P.TaskName left join users on users.Employee_ID=T.Owner where T.Milestone_Name=? and T.idProjects=?", [req.params.Milestone_Name, req.params.ID]);
      // const QC_List = await runQuery("SELECT * FROM `qc-portal`.checklist where Customer=?", [req.params.Customer]);
      const QC_List = await runQuery("SELECT * FROM `qc-portal`.checklist where Customer=?", [["MasTec-Windstream","MasTec-Comcast"].includes(milestoneData[0].Program)?milestoneData[0].Program:req.params.Customer]);
      const Markup = await runQuery("select markup.*,DATE_FORMAT(EndDate,'%c/%d/%y') as EndDate,DATE_FORMAT(StartDate,'%c/%d/%y') as StartDate,DATE_FORMAT(DueDate,'%c/%d/%y') as DueDate,DATE_FORMAT(DueDate,'%Y-%m-%d') as f_DueDate,DATE_FORMAT(EndDate,'%Y-%m-%d') as f_EndDate,users.Full_Name from markup left join users on users.Employee_ID=markup.Owner where markup.Task_Name in (select TaskName from task where Milestone_Name=? and idProjects=? union select SubTaskName as TaskName from subtask where Milestone_Name=? and idProjects=?)", [req.params.Milestone_Name, req.params.ID, req.params.Milestone_Name, req.params.ID]);
      const SubTask = await runQuery("Select subtask.*,DATE_FORMAT(StartDate,'%c/%d/%y') as StartDate,DATE_FORMAT(EndDate,'%c/%d/%y') as EndDate,DATE_FORMAT(subtask.Due_Date,'%c/%d/%y') as DueDate,DATE_FORMAT(subtask.Due_Date,'%Y-%m-%d') as f_DueDate,DATE_FORMAT(subtask.EndDate,'%Y-%m-%d') as f_EndDate,milestone.Customer as Customer,users.Full_Name from subtask inner join milestone left join users on users.Employee_ID=subtask.Owner where milestone.Milestone_Name=subtask.Milestone_Name and subtask.Milestone_Name=?", [req.params.Milestone_Name]);
      const attachments = await runQuery("SELECT A.*,date_format(A.Created_Date,'%c/%d/%y') as Created_Date,U.Full_Name FROM attachments as A inner join users as U on A.Owner=U.Employee_ID where A.Milestone=? and A.Status='Active' order by A.Category desc,A.idattachments desc", [req.params.Milestone_Name])
      const FinalAttachment = await runQuery("SELECT Project,Milestone,Category,Owner FROM attachments where Milestone=? and Status='Active' and Category like 'Milestone-Final-Deliverables%' group by Category,Project,Owner", [req.params.Milestone_Name,])
      let FinalDeliverables = {};
      attachments.forEach(row => {
        if (!FinalDeliverables[row.Category]) {
          FinalDeliverables[row.Category] = [];
        }
        FinalDeliverables[row.Category].push(row);
      });
      let category = Object.keys(FinalDeliverables);
      let newCat = category.filter(e => {
        if (e.startsWith("Milestone-Final-Deliverables")) {
          return e
        }
      });
      newCat = newCat.map(e => {
        return parseInt(e.split("-")[3].replace("R", ""));
      });
      let minR = Math.min(...newCat);
      let maxR = Math.max(...newCat);
      for (let i = 0; i <= maxR; i++) {
        let key = `Milestone-Final-Deliverables-R${i}`;
        if (!FinalDeliverables[key]) {
          FinalDeliverables[key] = [];
        }
      }
      FinalDeliverables = Object.keys(FinalDeliverables)
        .filter(key => key.startsWith("Milestone-Final-Deliverables"))
        .sort((a, b) => {
          // Extract R values and compare in reverse order
          let rA = parseInt(a.split("-")[3].replace("R", ""));
          let rB = parseInt(b.split("-")[3].replace("R", ""));
          return rB - rA; // Change to descending order
        })
        .reduce((acc, key) => {
          acc[key] = FinalDeliverables[key];
          return acc;
        }, {});
      let countMilestoneFinalDeliverables = Object.keys(FinalDeliverables).filter(key => key.startsWith("Milestone-Final-Deliverables")).length;
      req.session.attachmentsInput = {
        "Project_ID": milestoneData[0].Project_ID,
        "Customer": req.params.Customer,
        "Category": "Milestone-Input",
        "Milestone": milestoneData[0].Milestone_Name,
        "Type": "Input Files",
      }
      res.render('../views/PMO/Milestone', { userData: req.session.UserData, Notifications: getNotification(req), Milestone_Info: milestoneData[0], Owners: users, Task: tasks, Engineers: Engineers, QC_List: QC_List, subtask: SubTask, Markup: Markup, MilestoneTotalProductionTime: MilestoneTotalProductionTime, MilestoneTotalQCTime: MilestoneTotalQCTime, Customer: req.params.Customer, attachments: attachments, FinalAttachmentCount: countMilestoneFinalDeliverables, FinalDeliverables: FinalDeliverables })
    } catch (error) {
      console.log(error);
      next(error)
    }
  } else {
    res.redirect('/');
  }
});
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

app.get('/ViewTask/:Customer/:Milestone_Name/:Task_Name', async (req, res, next) => {
  if (req.session.UserID) {
    try {
      const milestoneData = await runQuery(`SELECT M.*,DATE_FORMAT(M.Prod_TGT_Start_Date,'%c/%d/%y') as Prod_TGT_Start_Date,DATE_FORMAT(M.Prod_TGT_End_Date,'%c/%d/%y') as Prod_TGT_End_Date,DATE_FORMAT(M.Prod_ACT_Start_Date,'%c/%d/%y') as Prod_ACT_Start_Date,DATE_FORMAT(M.Prod_ACT_End_Date,'%c/%d/%y') as Prod_ACT_End_Date,DATE_FORMAT(M.QC_TGT_Start_Date,'%c/%d/%y') as QC_TGT_Start_Date,DATE_FORMAT(M.QC_TGT_End_Date,'%c/%d/%y') as QC_TGT_End_Date,DATE_FORMAT(M.QC_ACT_Start_Date,'%c/%d/%y') as QC_ACT_Start_Date,DATE_FORMAT(M.QC_ACT_End_Date,'%c/%d/%y') as QC_ACT_End_Date,P.*,DATE_FORMAT(P.ReceivedDate,'%c/%d/%y') as n_ReceivedDate, DATE_FORMAT(P.DueDate,'%c/%d/%y') as n_DueDate,DATE_FORMAT(P.ApprovedDate,'%c/%d/%y') as n_ApprovedDate FROM milestone as M inner join ${projectTableNames[req.params.Customer].Table} as P where M.Project_ID=P.${projectTableNames[req.params.Customer].ProjectColumn} and M.idProjects=P.idProjects and M.Milestone_Name=?`, [req.params.Milestone_Name]);
      const Customer = await runQuery("select Customer from milestone where Milestone_Name=?", milestoneData[0].Milestone_Name);
      const users = await runQuery("select Employee_ID,Full_Name,Role from users where Status='Active' order by Full_Name");
      // const tasks = await runQuery("select T.*,date_format(T.DueDate,'%c/%d/%y') as DueDate, date_format(M.Prod_ACT_Start_Date,'%c/%d/%y') as Prod_ACT_Start_Date,date_format(M.Prod_ACT_End_Date,'%c/%d/%y') as Prod_ACT_End_Date,DATE_FORMAT(M.QC_ACT_Start_Date,'%c/%d/%y') as QC_ACT_Start_Date,DATE_FORMAT(M.QC_ACT_End_Date,'%c/%d/%y') as QC_ACT_End_Date from task  as T  inner join milestone as M where T.Milestone_Name=M.Milestone_Name  and T.Milestone_Name=? and T.TaskName=?", [req.params.Milestone_Name, req.params.Task_Name]);
      const tasks = await runQuery("select T.*,date_format(DueDate,'%c/%d/%y') as DueDate,DATE_FORMAT(DueDate,'%Y/%c/%d') as n_DueDate, date_format(StartDate,'%c/%d/%y') as StartDate,date_format(EndDate,'%c/%d/%y') as EndDate,users.Full_Name from task  as T left join users on users.Employee_ID=T.Owner where T.Milestone_Name=? and T.TaskName=?", [req.params.Milestone_Name, req.params.Task_Name]);
      const log = await runQuery("select T.*,DATE_FORMAT(T.startTime,'%c-%d-%y %T') as startTime,DATE_FORMAT(T.endTime,'%c-%d-%y %T') as endTime,U.Full_Name from timesheet as T inner join users as U on T.UserID=U.Employee_ID where TaskName=?;", [req.params.Task_Name]);
      const markup = await runQuery("select markup.*,DATE_FORMAT(EndDate,'%c/%d/%y') as EndDate,DATE_FORMAT(DueDate,'%c/%d/%y') as DueDate,DATE_FORMAT(StartDate,'%c/%d/%y') as StartDate,DATE_FORMAT(DueDate,'%Y-%m-%d') as f_DueDate,DATE_FORMAT(EndDate,'%Y-%m-%d') as f_EndDate,users.Full_Name from markup inner join users on users.Employee_ID=markup.Owner where Task_Name=?", [req.params.Task_Name]);
      const Comments = JSON.parse(tasks[0].Comments);
      let productionCompleted = false;
      const CQCIteration = await runQuery('SELECT TaskName FROM task where Type="CQC" and Project_ID=? and idProjects=? and Milestone_Name=?', [milestoneData[0].Project_ID, milestoneData[0].idProjects, milestoneData[0].Milestone_Name]);
      const CQCTaskArray = CQCIteration.map(task => task.TaskName);
      const USQCIteration = await runQuery('SELECT TaskName FROM task where Type="USQC" and Project_ID=? and idProjects=? and Milestone_Name=?', [milestoneData[0].Project_ID, milestoneData[0].idProjects, milestoneData[0].Milestone_Name]);
      const USQCTaskArray = USQCIteration.map(task => task.TaskName);
      const ProductionInfo = await runQuery('SELECT * FROM task where Milestone_Name=? and Type="Production" and EndDate is null and Status not in ("Completed","Submitted")', [req.params.Milestone_Name]);
      const TaggedProductionInfo = await runQuery('SELECT * FROM task where Milestone_Name=? and Type="Production" and EndDate is null and Status not in ("Completed","Submitted") and TaskName=?', [req.params.Milestone_Name, tasks[0].Prod_Task]);
      if (ProductionInfo.length > 0 || TaggedProductionInfo.length > 0) {
        productionCompleted = false
      } else {
        productionCompleted = true
      }
      if (TaggedProductionInfo.length > 0) {
        productionCompleted = false
      } else {
        productionCompleted = true;
      }
      const subTask = await runQuery("select subtask.*,DATE_FORMAT(EndDate,'%c/%d/%y') as EndDate,DATE_FORMAT(StartDate,'%c/%d/%y') as StartDate,DATE_FORMAT(Due_Date,'%c/%d/%y') as DueDate,DATE_FORMAT(Due_Date,'%Y-%m-%d') as f_DueDate,DATE_FORMAT(EndDate,'%Y-%m-%d') as f_EndDate,users.Full_Name from subtask inner join users on users.Employee_ID=subtask.Owner where Task_Name=? and Milestone_Name=?", [req.params.Task_Name, req.params.Milestone_Name]);
      const subTaskCount = await runQuery("select * from subtask where Task_Name=? and Milestone_Name=? and Status='Completed'", [req.params.Task_Name, req.params.Milestone_Name]);
      let subTaskTotalTime = await runQuery("select sum(TotalTime) as TotalTime from ((select sum(TotalTime) as TotalTime from subtask  where Task_Name=?) union all select sum(TotalTime) as TotalTime from markup where Task_Name in (select SubTaskName from subtask where Task_Name=?) union all select sum(TotalTime) as TotalTime from markup where Task_Name=?) as tampTable;", [req.params.Task_Name, req.params.Task_Name, req.params.Task_Name]);
      subTaskTotalTime = subTaskTotalTime[0].TotalTime ? subTaskTotalTime[0].TotalTime : 0;
      const QC_List = await runQuery("SELECT * FROM `qc-portal`.checklist;");
      const attachments = await runQuery("SELECT A.*,S.Task_Name,S.SubTaskLabel as Task,U.Full_Name,date_format(A.Created_Date,'%c/%d/%y') as Created_Date FROM attachments as A left join subtask as S on S.SubTaskName=A.TaskID left join users U on U.Employee_ID=A.Owner where A.Milestone=? and A.TaskID=? and A.Status='Active' order by A.idattachments desc", [req.params.Milestone_Name, req.params.Task_Name])
      req.session.attachmentsInput = {
        "Project_ID": milestoneData[0].Project_ID,
        "Customer": Customer[0].Customer,
        "Category": "Task",
        "Milestone": milestoneData[0].Milestone_Name,
        "Task": tasks[0].TaskName,
        "TaskID": tasks[0].TaskName,
      }
      res.render('../views/PMO/Task', { userData: req.session.UserData, Notifications: getNotification(req), Milestone_Info: milestoneData[0], Owners: users, Task: tasks[0], subTask: subTask, Log: log, markup: markup, Comments: Comments, Customer: Customer[0].Customer, ProductionStatus: productionCompleted, CompletedSubtask: subTaskCount, subTaskTotalTime: subTaskTotalTime, CQCIteration: CQCTaskArray.indexOf(req.params.Task_Name) + 1, USQCIteration: USQCTaskArray.indexOf(req.params.Task_Name) + 1, QC_List: QC_List, attachments: attachments });
    } catch (error) {
      console.log(error);
      res.redirect("/NotFound")
    }
  } else {
    res.redirect('/');
  }
});

app.get("/SubTask/:SubtaskID", async (req, res, next) => {
  if (req.session.UserID) {
    const Subtask = await runQuery("Select subtask.*,DATE_FORMAT(EndDate,'%c/%d/%y') as EndDate,DATE_FORMAT(StartDate,'%c/%d/%y') as StartDate,DATE_FORMAT(Due_Date,'%c/%d/%y') as DueDate,DATE_FORMAT(Due_Date,'%Y/%c/%d') as n_DueDate,users.Full_Name from subtask inner join users on users.Employee_ID=subtask.Owner where SubTaskName=?", [req.params.SubtaskID]);
    const log = await runQuery("select T.*,DATE_FORMAT(T.startTime,'%c-%d-%y %T') as startTime,DATE_FORMAT(T.endTime,'%c-%d-%y %T') as endTime,U.Full_Name from timesheet as T inner join users as U on T.UserID=U.Employee_ID where TaskName=?;", [req.params.SubtaskID]);
    const markup = await runQuery("select markup.*,DATE_FORMAT(EndDate,'%c/%d/%y') as EndDate,DATE_FORMAT(StartDate,'%c/%d/%y') as StartDate,users.Full_Name from markup inner join users on users.Employee_ID=markup.Owner where Task_Name=?", [req.params.SubtaskID]);
    let markupTotalTime = await runQuery("select sum(TotalTime) as Total_Markup_Time from markup where Task_Name=?", [req.params.SubtaskID]);
    markupTotalTime = markupTotalTime[0].Total_Markup_Time ? markupTotalTime[0].Total_Markup_Time : 0;
    const users = await runQuery("select Employee_ID,Full_Name,Role from users where Status='Active' order by Full_Name");
    try {
      const Comments = JSON.parse(Subtask[0].Comments);
      const QC_Task = await runQuery("Select subtask.*,DATE_FORMAT(EndDate,'%c/%d/%y') as EndDate,DATE_FORMAT(StartDate,'%c/%d/%y') as StartDate,DATE_FORMAT(Due_Date,'%c/%d/%y') as DueDate,users.Full_Name from subtask inner join users on users.Employee_ID=subtask.Owner where Prod_Sub_Task=?", [req.params.SubtaskID]);
      let Milestone_Info = await runQuery("select * from milestone where Milestone_Name=?", Subtask[0].Milestone_Name);
      Milestone_Info = await runQuery(`Select M.Customer as Customer,P.Region as Region from milestone M inner join ${projectTableNames[Milestone_Info[0].Customer].Table} as P where P.idProjects=M.idProjects and M.Project_ID=P.${projectTableNames[Milestone_Info[0].Customer].ProjectColumn} and M.Milestone_Name=?`, Subtask[0].Milestone_Name);
      if (Milestone_Info.length <= 0) {
        return res.redirect("/NotFound")
      }
      const attachments = await runQuery("SELECT A.*,S.Task_Name,S.SubTaskLabel as Task,U.Full_Name,date_format(A.Created_Date,'%c/%d/%y') as Created_Date FROM attachments as A left join subtask as S on S.SubTaskName=A.TaskID left join users U on U.Employee_ID=A.Owner where A.Milestone=? and A.TaskID=? and A.Status='Active' order by A.idattachments desc", [Subtask[0].Milestone_Name, req.params.SubtaskID])
      const ParentTask = await runQuery("select * from task where TaskName=?", [Subtask[0].Task_Name])
      req.session.attachmentsInput = {
        "Project_ID": Subtask[0].Project_ID,
        "Customer": Milestone_Info[0].Customer,
        "Category": "Subtask",
        "Milestone": Subtask[0].Milestone_Name,
        "Task": Subtask[0].SubTaskName,
        "TaskID": Subtask[0].SubTaskName,
        "ParentTask": Subtask[0].Task_Name,
      }
      res.render("../views/PMO/Subtask", { userData: req.session.UserData, Notifications: getNotification(req), Owners: users, Task: Subtask[0], Log: log, markup: markup, Comments: Comments, Customer: Milestone_Info[0].Customer, Milestone_Info: Milestone_Info[0], markupTotalTime: markupTotalTime, Tagged_QC_Task: QC_Task, attachments: attachments, ParentTaskStatus: ParentTask[0].Status });
    } catch (error) {
      console.log(error);
      res.redirect("/NotFound")
    }
  } else {
    res.redirect("/")
  }
})

app.get("/Markup/:MarkupName", async (req, res, next) => {
  if (req.session.UserID) {
    try {
      const Markups = await runQuery(`select markup.*,DATE_FORMAT(DueDate,'%c/%d/%y') as DueDate,
      DATE_FORMAT(StartDate,'%c/%d/%y') as StartDate,
      DATE_FORMAT(EndDate,'%c/%d/%y') as EndDate,
      DATE_FORMAT(DueDate,'%Y/%c/%d') as n_DueDate,
      users.Full_Name
       from markup inner join users on users.Employee_ID=markup.Owner where Sub_Task_Name=?`, [req.params.MarkupName]);
      const Customer = await runQuery("select Customer from milestone where Milestone_Name=?", Markups[0].Milestone_Name);
      const users = await runQuery("select Employee_ID,Full_Name,Role from users where Status='Active' order by Full_Name");
      const log = await runQuery("select T.*,DATE_FORMAT(T.startTime,'%c-%d-%y %T') as startTime,DATE_FORMAT(T.endTime,'%c-%d-%y %T') as endTime,U.Full_Name from timesheet as T inner join users as U on T.UserID=U.Employee_ID where TaskName=?;", [req.params.MarkupName]);
      const Comments = JSON.parse(Markups[0].Comments)
      const attachments = await runQuery("SELECT A.*,S.Task_Name,S.SubTaskLabel as Task,U.Full_Name,date_format(A.Created_Date,'%c/%d/%y') as Created_Date FROM attachments as A left join subtask as S on S.SubTaskName=A.TaskID left join users U on U.Employee_ID=A.Owner where A.Milestone=? and A.TaskID=? and A.Status='Active' order by A.idattachments desc", [Markups[0].Milestone_Name, req.params.MarkupName])
      req.session.attachmentsInput = {
        "Project_ID": Markups[0].Project_ID,
        "Customer": Customer[0].Customer,
        "Category": "Markup",
        "Milestone": Markups[0].Milestone_Name,
        "Task": Markups[0].Sub_Task_Name,
        "TaskID": Markups[0].Sub_Task_Name,
        "ParentTask": Markups[0].Task_Name,
      }
      res.render("../views/PMO/Markup", { Owners: users, userData: req.session.UserData, Notifications: getNotification(req), Markup: Markups[0], Log: log, Comments: Comments, Customer: Customer[0].Customer, attachments: attachments });
    } catch (error) {
      next(error);
    }
  } else {
    res.redirect('/');
  }
});

app.post('/CreateTask', async (req, res, next) => {
  if (req.session.UserID && req.session.UserRole == "PMO" || req.session.UserRole == "Manager") {
    let formData = req.body;
    let duplicateProject = [], rejectedProject = [], InvalidDate = [];
    formData.Milestone_Name = Array.isArray(formData.Milestone_Name) ? formData.Milestone_Name : [formData.Milestone_Name];
    formData.ID = Array.isArray(formData.ID) ? formData.ID : [formData.ID];
    for (let index = 0; index < formData.Milestone_Name.length; index++) {
      let Milestone = formData.Milestone_Name[index];
      let ID = formData.ID[index];
      // const result = await runQuery("select Count(*) as counter,TaskName from task where Type=?", [formData.Type]);
      const result = await runQuery("select TaskName from task where Type=? order by idTask desc limit 1", [formData.Type]);
      const projectID = await runQuery("select Project_ID,Customer,idProjects from milestone where Milestone_Name=? and idProjects=?", [Milestone, ID]);
      const ProjectDetails = await getProjectDetails(projectID[0].Customer, projectID[0].idProjects);
      let ProjectDueDate = ProjectDetails.DueDate ? new Date(ProjectDetails.DueDate) : null;
      let ProjectReceivedDate = ProjectDetails.ReceivedDate ? new Date(ProjectDetails.ReceivedDate) : null;
      ProjectDueDate = (new Date(ProjectDueDate.setDate(ProjectDueDate.getDate() + 1)).toISOString().slice(0, 10));
      ProjectReceivedDate = (new Date(ProjectReceivedDate.setDate(ProjectReceivedDate.getDate() + 1)).toISOString().slice(0, 10));
      if (formData.DueDate < ProjectReceivedDate) {
        InvalidDate.push(Milestone)
        break;
      }
      let TaskName = result[0].TaskName;
      let extract = TaskName.match(/\d+/);
      let temp = parseInt(extract[0]) + 1;
      // let temp = result[0].counter + 1;
      temp = String(temp).padStart(7, '0');
      const Data = {
        idProjects: ID,
        TaskName: formData.Type.slice(0, 4).toLocaleUpperCase('en-US') + '-' + temp,
        Milestone_Name: Milestone,
        Project_ID: projectID[0].Project_ID,
        Type: formData.Type,
        QC_Name: formData.QC_Name ? formData.QC_Name : null,
        Remark: formData.Remark,
        Owner: formData.Owner ? formData.Owner : null,
        Score: formData.Score ? formData.Score : null,
        TaskLabel: formData.TaskLabel,
        Created_Date: getTimeStamp(),
        Created_By: req.session.UserID,
        Comments: '{}',
        TechInfo: '{}',
        DueDate: formData.DueDate,
        Prod_Task: formData.Prod_Task ? formData.Prod_Task : null,
        QC_Due_Date: formData.QC_Due_Date ? formData.QC_Due_Date : null,
        autoQC: formData.autoQC ? formData.autoQC : '0'
      }

      //Restricting the CQC Task Creation Before Completing the QC Task
      if (formData.Type == "CQC" || formData.Type == "USQC") {
        const PendingQCInfo = await runQuery("select * from task where Type in ('IQC','RQC','Production','CQC','USQC') and idProjects=? and Milestone_Name=? and Status!='Completed'", [ID, Milestone]);
        const taskList = await runQuery("select * from task where Type in ('IQC','RQC','Production') and idProjects=? and Milestone_Name=?", [ID, Milestone]);
        const QCInfo = await runQuery("select * from task where Type in ('IQC','RQC','Production','CQC','USQC') and idProjects=? and Milestone_Name=?", [ID, Milestone]);
        if (PendingQCInfo.length > 0 || taskList.length == 0) {
          req.session.Notifications = JSON.stringify(new Notification('Note!', 'Ensure that all initial Production,QC and CQC tasks are completed before proceeding to initiate the new CQC task.', 'verified', '10s'));
          return res.redirect(req.headers.referer)
        } else {
          const Milestone_Info = await runQuery("Select * from milestone where idProjects=? and Milestone_Name=?", [ID, Milestone]);
          if (Milestone_Info.length) {
            Data.Owner = Milestone_Info[0].Owner;
          }
        }
      }
      await runQuery("insert into task set ?", [Data]).then(async data => {
        let InputData = {};
        InputData.Milestone_Status = "WIP";
        if (formData.Type == "Production") {
          InputData.Prod_ACT_End_Date = null;
        } else if (formData.Type == "IQC") {
          InputData.QC_ACT_End_Date = null;
        } else if (formData.Type == "RQC") {
          InputData.QC_ACT_End_Date = null;
        } else if (formData.Type == "CQC" || formData.Type == "USQC") {
          InputData.Milestone_Status = (formData.Type == "CQC") ? "CQC-YTS" : "USQC-YTS";
          await runQuery(`Update ${projectTableNames[projectID[0].Customer].Table}  set Status="WIP" where ${projectTableNames[projectID[0].Customer].ProjectColumn}=? and idProjects=?`, [projectID[0].Project_ID, projectID[0].idProjects])
        }
        await runQuery("Update milestone set ? where Milestone_Name=? and idProjects=?", [InputData, Milestone, ID]);
        try {
          if (formData.Type == "IQC" || formData.Type == "RQC") {
            await runQuery("update task set Status='IQC-YTS' where Type='Production' and TaskName=? and Project_ID=? and idProjects=?", [formData.Prod_Task, Data.Project_ID, Data.idProjects])
          }
        } catch (error) {
          console.log(error)
        }
        sendNotification(Data.Owner, `New Task Assignment: ${Milestone + '_' + Data.TaskName}`);
        runQuery("select * from users where Employee_ID=?", [Data.Owner]).then(async data => {
          if (data.length > 0) {
            await SendEmail(data[0].Email_ID, "", `New Task Assignment: ${Milestone + '_' + Data.TaskName}`, `<div style="font-size:14px">
              <p>Dear <b>${data[0].Full_Name}</b>,</p>
              <p>Please be informed that the following new task has been assigned to you.</p>
              <hr>
              <p><b>Task Name: </b>${Data.TaskLabel ? Data.TaskLabel : null} <a href='${encodeURI(getBaseURL(req) + '/ViewTask/' + projectID[0].Customer + '/' + Milestone + '/' + Data.TaskName)}'>${Data.TaskName}</a></p> 
              <p><b>Milestone: </b>${Milestone}</p>
              <hr>
              <p>Please ensure timely completion of this task.</p>
          </div>`);
          }
        });
      }).catch(error => {
        if (error?.code == 'ER_DUP_ENTRY') {
          duplicateProject.push(Data.Milestone_Name);
        } else if (error?.code == "ER_SIGNAL_EXCEPTION") {
          InvalidDate.push(Data.Milestone_Name);
        } else {
          console.log(error);
          rejectedProject.push(Data.Milestone_Name);
        }
      });

    }
    if (duplicateProject.length > 0) {
      req.session.Notifications = JSON.stringify(new Notification('Note!', formData.Type + ' Task are already created for these milestones.' + duplicateProject.join(','), 'verified', '10s'));
    }
    if (InvalidDate.length > 0) {
      req.session.Notifications = JSON.stringify(new Notification('Error!', 'The ' + formData.Type + ' Task Due Date is exceeding the Project Deadline for the following Milestones ' + InvalidDate.join(",") + ' try again.', 'error', '10s'));
    } else if (rejectedProject.length > 0) {
      req.session.Notifications = JSON.stringify(new Notification('Error!', 'Something went wrong unable to create ' + formData.Type + ' task for these milestones ' + rejectedProject.join(",") + ' try again.', 'error', '10s'));
    } else {
      req.session.Notifications = JSON.stringify(new Notification('Success..!', 'Task(s) are successfully created.', 'success', '2s'));
    }
    res.redirect(req.headers.referer);
  } else {
    res.redirect('/')
  }
});

app.post("/CreateSubtask", async (req, res, next) => {
  if (req.session.UserID) {
    let Data = req.body;
    try {
      const TaskInfo = await runQuery("Select * from task where idTask=?", [Data.idTask]);
      Data.Type = Data.Type ? Data.Type : TaskInfo[0].Type;
      Data.QC_Name = TaskInfo[0].QC_Name;
      if (TaskInfo[0].Status != "WIP") {
        req.session.Notifications = JSON.stringify(new Notification('Error!', 'Something went wrong unable to create subtask for this task', 'error', '5s'));
        return res.redirect(req.headers.referer);
      }
      //const result = await runQuery("select Count(*) as counter from subtask;");
      const result = await runQuery("select SubTaskName as TaskName from subtask order by idSubTask desc limit 1");
      //let temp = result[0].counter + 1;
      let TaskName = result[0].TaskName;
      let extract = TaskName.match(/\d+/);
      let temp = parseInt(extract[0]) + 1;
      temp = String(temp).padStart(7, '0');
      Data.SubTaskName = 'SUB-'.concat(temp);
      Data.Created_Date = getTimeStamp();
      Data.Created_By = req.session.UserID;
      Data.Comments = '{}';
      Data.QC_Due_Date = Data.QC_Due_Date ? Data.QC_Due_Date : null;
      const projectID = await runQuery("select Project_ID,Customer,idProjects from milestone where Milestone_Name=? and idProjects=?", [Data.Milestone_Name, Data.idProjects]);
      const ProjectDetails = await getProjectDetails(projectID[0].Customer, projectID[0].idProjects);
      let ProjectDueDate = ProjectDetails.DueDate ? new Date(ProjectDetails.DueDate) : null;
      let ProjectReceivedDate = ProjectDetails.ReceivedDate ? new Date(ProjectDetails.ReceivedDate) : null;
      ProjectDueDate = (new Date(ProjectDueDate.setDate(ProjectDueDate.getDate() + 1)).toISOString().slice(0, 10));
      ProjectReceivedDate = (new Date(ProjectReceivedDate.setDate(ProjectReceivedDate.getDate() + 1)).toISOString().slice(0, 10));
      if ((Data.Due_Date < ProjectReceivedDate)) {
        req.session.Notifications = JSON.stringify(new Notification('Note!', 'The Subtask Due Date is exceeding the Project deadline, so the subtask is not created.', 'verified', '10s'));
        return res.redirect(req.headers.referer);
      }
      await runQuery("insert into subtask set ?", [Data]).then(() => {
        sendNotification(Data.Owner, `New Subtask "${Data.SubTaskLabel}" is assigned to you.`);
        runQuery("select * from users where Employee_ID=?", [Data.Owner]).then(async data => {
          if (data.length > 0) {
            await SendEmail(data[0].Email_ID, "", `New Subtask Assignment: ${Data.Milestone_Name + '_' + TaskInfo[0].TaskName + '_' + Data.SubTaskName}`, `<div style="font-size:14px">
            <p>Dear <b>${data[0].Full_Name}</b>,</p>
            <p>Please be informed that the following new subtask has been  assigned to you.</p>
            <hr>
            <p><b>Subtask Name: </b> <a href='${encodeURI(getBaseURL(req) + '/SubTask/' + Data.SubTaskName)}'>${Data.SubTaskName}</a></p>
            <p><b>Task Name: </b> ${TaskInfo[0].TaskName}</p>
            <hr>
            <p>Please ensure timely completion of this task.</p>
        </div>`);
          }
        });
        req.session.Notifications = JSON.stringify(new Notification('Success..!', 'Subtask have been created successfully.', 'success', '2s'));
      }).catch(e => {
        if (e?.error?.code == 'ER_DUP_ENTRY') {
          req.session.Notifications = JSON.stringify(new Notification('Note!', 'This type of Subtask is already exist for this milestone. Try different Subtask Label', 'verified', '10s'));
        } else {
          console.log(e.error.code);
          req.session.Notifications = JSON.stringify(new Notification('Error!', 'Internal Sever Error, Unable to create Subtask for this Task', 'error', '10s'));
        }
      });
    } catch (er) {
      console.log(er)
      req.session.Notifications = JSON.stringify(new Notification('Error!', 'Something went wrong unable to create Subtask for this Task', 'error', '10s'));
    }
    res.redirect(req.headers.referer);
  } else {
    res.status(500).send("Access Denied")
  }
})
app.post('/UpdatePassword', async (req, res, next) => {
  if (req.session.UserID) {
    bcrypt.hash(req.body.Password, saltRounds).then(async (hash) => {
      await runQuery("Update users set Password=? where Employee_ID=?", [hash, req.session.UserID]).then(() => {
        io.emit(`notification-${req.session.UserID}`, "Password Updated Successfully.");
        res.redirect(req.headers.referer);
      }).catch((er) => {
        next(er)
        io.emit(`notification-${req.session.UserID}`, "Something Went Wrong, Unable To Update the Password.");
        res.redirect(req.headers.referer);
      })
    }).catch((er) => {
      next(er);
      io.emit(`notification-${req.session.UserID}`, "Something Went Wrong, Unable To Update the Password.");
      res.redirect(req.headers.referer);
    })
  } else {
    res.redirect('/')
  }
});

app.get('/changePassword', async (req, res) => {
  if (req.session.UserID) {
    res.render('ChangePassword', { userData: req.session.UserData, Notifications: getNotification(req), userName: req.session.UserName, Role: req.session.UserRole, title: "Change Password" })
  } else {
    res.redirect('/login');
  }
});

app.post('/uploadImage', (req, res) => {
  if (req.session.UserID) {
    upload(req, res, function (err) {
      if (err) {
        console.log(err);
        res.status(400).send(err);
      } else {
        res.send(res.req.file.filename);
      }
    });
  } else {
    res.status(400).send("Access Denied")
  }
});

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/error' }),
  function (req, res) {
    try {
      let temp = userProfile.emails[0]['value']
      db.query("select *,DATE_FORMAT(LastSeen,'%c/%d/%y') as n_LastSeen from users where Email_ID=? and status='Active'", [temp], function (error, result) {
        if (error) {
          console.log(error)
          res.redirect('/logout')
        }
        else {
          let UserData = result[0];
          UserData.DisplayName = userProfile.displayName;
          UserData.DisplayPicture = userProfile.photos[0]['value'];
          req.session.UserData = UserData;
          req.session.UserID = result[0].Employee_ID;
          const temp = new Notification('Success..!', 'Login Successful.', 'success', '2s');
          req.session.Notifications = JSON.stringify(temp);
          req.session.UserRole = result[0].Role;
          req.session.UserName = result[0].Full_Name;
          res.redirect('/login')
        }
      });
    } catch (error) {
      console.log(error)
      res.redirect('/logout')
    }
  });

app.get('/Profile', async (req, res) => {
  if (req.session.UserID) {
    const data = await runQuery("select * from users where Employee_ID=?", [req.session.UserID]);
    if (data.length > 0) {
      res.render('../views/Employees/UserProfile', { userData: req.session.UserData, Notifications: getNotification(req), Profile: data[0] })
    } else {
      res.redirect('/')
    }
  } else {
    res.redirect('/');
  }
});
app.get("/Tasks", async (req, res) => {
  if (req.session.UserID) {
    try {
      const data = await runQuery(`select T.*,date_format(T.StartDate,'%c/%d/%y') as StartDate,date_format(T.DueDate,'%c/%d/%y') as DueDate,
        date_format(T.EndDate,'%c/%d/%y') as EndDate,DATE_FORMAT(T.DueDate,'%Y-%m-%d') as f_DueDate,DATE_FORMAT(T.EndDate,'%Y-%m-%d') as f_EndDate,m.Customer
        from task  as T inner join milestone as m on m.Milestone_Name=T.Milestone_Name where T.Owner=?`, [req.session.UserID]);
      let Status = getUniqueValuesForKey(data, "Status");
      res.render('../views/Employees/Task_List', { userData: req.session.UserData, Notifications: getNotification(req), Task: data, FilterData: { Status: Status } });
    } catch (error) {
      console.log(error)
    }
  } else {
    res.redirect("/")
  }
});
app.get("/Sub_Tasks", async (req, res) => {
  if (req.session.UserID) {
    try {
      const data = await runQuery(`select T.*,date_format(T.StartDate,'%c/%d/%y') as StartDate,date_format(T.Due_Date,'%c/%d/%y') as DueDate,
        date_format(T.EndDate,'%c/%d/%y') as EndDate,DATE_FORMAT(T.Due_Date,'%Y-%m-%d') as f_DueDate,DATE_FORMAT(T.EndDate,'%Y-%m-%d') as f_EndDate,m.Customer
        from subtask  as T inner join milestone as m on m.Milestone_Name=T.Milestone_Name where T.Owner=?`, [req.session.UserID]);
      let Status = getUniqueValuesForKey(data, "Status");
      res.render('../views/Employees/Subtask_List', { userData: req.session.UserData, Notifications: getNotification(req), subtask: data, FilterData: { Status: Status } });
    } catch (error) {
      console.log(error)
    }
  } else {
    res.redirect("/")
  }
});
app.get("/Markups", async (req, res) => {
  if (req.session.UserID) {
    try {
      const data = await runQuery(`select *,date_format(DueDate,'%c/%d/%y') as DueDate,date_format(StartDate,'%c/%d/%y') as StartDate,date_format(EndDate,'%c/%d/%y') as EndDate,
        DATE_FORMAT(DueDate,'%Y-%m-%d') as f_DueDate,DATE_FORMAT(EndDate,'%Y-%m-%d') as f_EndDate
         from markup where Owner=?`, [req.session.UserID]);
      let Status = getUniqueValuesForKey(data, "Status");
      res.render('../views/Employees/Markup_List', { userData: req.session.UserData, Notifications: getNotification(req), markup: data, FilterData: { Status: Status } });
    } catch (error) {
      console.log(error)
    }
  } else {
    res.redirect("/")
  }
});
app.get('/Labour_Code_Generator', async (req, res) => {
  if (req.session.UserID) {
    const Truth_Table = await runQuery("Select * from labour_code_truth_table");
    res.render('../views/Manager/Labour-Code-Generator', { userData: req.session.UserData, Notifications: getNotification(req), Truth_Table: Truth_Table });
  } else {
    res.redirect("/")
  }
});
app.get("/timesheet", async (req, res) => {
  if (req.session.UserID) {
    return res.render("../views/Employees/UserTimeSheet", { userData: req.session.UserData, Notifications: getNotification(req) });
  } else {
    res.redirect("/")
  }

})
app.get('/NotFound', (req, res) => {
  res.render('../views/Not-Found')
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});
app.get("/sendmail", async (req, res) => {
  await SendEmail("ajith.venkatesh@quadgenwireless.com", "", `New Task Assignment: ${"J68185-Create Estimate" + '_' + "PROD-0000007"}`, `<div style="font-size:14px">
    <p>Dear <b>Ajith V</b>,</p>
    <p>Please be informed that the following task has been assigned to you:</p>
    <hr>
    <p>${"<b>  Task Name: </b> " + "Test Task"} <a href='#'><b>${"PROD-0000007"}</b></a></p>
    <p> <b>Milestone Name: </b> ${"J68185-Create Estimate"}</p>
    <hr>
    <p>Please ensure timely completion of this task.</p>
</div>`);
})
app.get('*', async (req, res) => {
  res.redirect('/NotFound');
  //res.status(400).send("Page Not Found");
});


