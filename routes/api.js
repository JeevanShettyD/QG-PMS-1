const express = require('express');
const api_router = express.Router()
const multer = require('multer');
const fs = require('fs');
const axios = require('axios');
const path = require("path");
const db = require('../DataBaseConnection');
const SendEmail = require('../Email');
// const runQuery = require('../RunQuery');
const { runQuery, runTransaction } = require('../RunQuery');
const crypto = require('crypto');
const excel = require('exceljs');
const xlsx = require('xlsx');
const Notification = require('../Notification');
const PDFGenerator = require('pdfkit');
const PdfPrinter = require('pdfmake');
const bcrypt = require('bcrypt');
const https = require("https");
const archiver = require('archiver');
require('dotenv').config();
const { json } = require('body-parser');
const { arrayAsString } = require('pdf-lib');
// For React API
const jwt = require('jsonwebtoken');
const { send } = require('process');
const { warn } = require('console');
const regex = /[^a-zA-Z0-9]/g;
const saltRounds = 11;
// Create an instance of the HTTPS agent with rejectUnauthorized set to false
const agent = new https.Agent({
    rejectUnauthorized: false
});
// Define fonts for pdfmake library.
const fonts = {
    Roboto: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique'
    }
};
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

const profilePicStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        let uploadDir = "./public/uploads/Profile";
        fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    }, filename: function (req, file, cb) {
        cb(null, req.session.UserID.replace(regex, '') + '_' + Date.now() + path.extname(file.originalname));
    }
});
const attachmentStorage = multer.diskStorage({
    destination: async function (req, file, cb) {
        let uploadDir = path.join(__dirname, "..", "public", "Temp", 'uploads');
        fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: async function (req, file, cb) {
        cb(null, file.originalname);
    }
});
// Path to save the Invoices
const invoiceStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        let uploadDir = "./public/uploads/Invoices";
        fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    }, filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});
// Path to save the Credit Notes
const creditNoteStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        let uploadDir = "./public/uploads/Credit_Notes";
        fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    }, filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});
const UploadAttachments = multer({ limits: { fileSize: 100 * 1024 * 1024, fieldSize: 10 * 1024 * 1024, }, storage: attachmentStorage });
const UploadProfilePic = multer({ storage: profilePicStorage, limits: { fileSize: 2 * 1024 * 1024 } }).single("ProfilePic");
const ServerBuffer = multer({ storage: multer.memoryStorage() })
const uploadInvoice = multer({ limits: { fieldSize: 10 * 1024 * 1024, }, storage: invoiceStorage });
const uploadCreditNote = multer({ limits: { fieldSize: 10 * 1024 * 1024, }, storage: creditNoteStorage });
function getTimeStamp() {
    return (new Date().toLocaleString("en-CA", { timeZone: 'Asia/Kolkata' }).split(',')[0] + " " + new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false }))
}
async function determineUploadDir(data) {
    let uploadDir;
    let year = new Date().getFullYear()
    if (data.Category == "Markup") {
        let markupInfo = await runQuery("Select * from markup where Sub_Task_Name=?", [data.TaskID]);
        if (markupInfo.length) {
            if (markupInfo[0].MarkupFor == "Subtask") { //Markup for IQC Subtask
                let MainTask = await runQuery("select * from subtask where SubTaskName=?", [markupInfo[0].Task_Name]);
                if (MainTask.length && MainTask[0].Prod_Sub_Task) { //QC-Markup for production subtask
                    let temp = await runQuery("select * from subtask where SubTaskName=?", [MainTask[0].Prod_Sub_Task]);// Get Actual Production Task
                    if (temp.length) {
                        //Path to store the attachments for markup with 2 layer of subtask
                        uploadDir = "/mnt/nas/QGPMS_Dump/" + year + '/' + data.Customer + '/' + data.Project_ID + '/' + data.Milestone + '/' + temp[0].Task_Name + '/' + MainTask[0].Prod_Sub_Task + '/' + MainTask[0].SubTaskName + '/' + data.TaskID;
                    }
                } else if (MainTask.length) {
                    uploadDir = "/mnt/nas/QGPMS_Dump/" + year + '/' + data.Customer + '/' + data.Project_ID + '/' + data.Milestone + '/' + MainTask[0].Task_Name + '/' + MainTask[0].SubTaskName + '/' + data.TaskID;
                    data.ParentTask = MainTask[0].Task_Name
                }
            } else {
                uploadDir = "/mnt/nas/QGPMS_Dump/" + year + '/' + data.Customer + '/' + data.Project_ID + '/' + data.Milestone + '/' + data.ParentTask + '/' + data.TaskID;
            }
        }
    } else if (data.Category == "Subtask") {
        let subtaskInfo = await runQuery("select * from subtask where SubTaskName=?", [data.TaskID]);
        if (subtaskInfo.length && subtaskInfo[0].Prod_Sub_Task) {
            let temp = await runQuery("select * from subtask where SubTaskName=?", [subtaskInfo[0].Prod_Sub_Task]);// Get Actual Production Task
            if (temp.length) {
                uploadDir = "/mnt/nas/QGPMS_Dump/" + year + '/' + data.Customer + '/' + data.Project_ID + '/' + data.Milestone + '/' + temp[0].Task_Name + '/' + temp[0].SubTaskName + '/' + data.TaskID;
            }
        } else if (subtaskInfo.length) {
            uploadDir = "/mnt/nas/QGPMS_Dump/" + year + '/' + data.Customer + '/' + data.Project_ID + '/' + data.Milestone + '/' + subtaskInfo[0].Task_Name + '/' + data.TaskID;
        }
    } else if (data.Category == "Task") {
        uploadDir = "/mnt/nas/QGPMS_Dump/" + year + '/' + data.Customer + '/' + data.Project_ID + '/' + data.Milestone + '/' + data.TaskID;
    } else if (data.Type) {//For Milestones
        if (data.Type == "Final Deliverables") {
            let RValue = data.Category.split("-")[3]
            uploadDir = "/mnt/nas/QGPMS_Dump/" + year + '/' + data.Customer + '/' + data.Project_ID + '/' + data.Milestone + '/' + data.Type + '/' + RValue;
        } else {
            uploadDir = "/mnt/nas/QGPMS_Dump/" + year + '/' + data.Customer + '/' + data.Project_ID + '/' + data.Milestone + '/' + data.Type;
        }
    } else {
        uploadDir = "/mnt/nas/QGPMS_Dump/" + year + '/' + data.Customer + '/' + data.Project_ID;
    }
    return uploadDir;
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
function getBaseURL(req) {
    return (`${req.protocol}` + '://' + `${req.get('host')}`);
}
const upload = multer({ storage: myStorage, limits: { fileSize: 50 * 1024 * 1024 } }).single("NoteRefDoc");
const RefDocUpload = multer({ storage: myStorage, limits: { fileSize: 50 * 1024 * 1024 } });
// String Encoder and decoder
function decodePK(key, times = 3) {
    return new Array(times).fill().reduce((acc) => Buffer.from(acc, 'base64').toString('utf8'), key);
}
function encodePK(key, times = 3) {
    return new Array(times).fill().reduce((acc) => Buffer.from(acc.toString()).toString('base64'), key);
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
                console.log(error);
                reject(error)
            })
        });
    }
    function sendTostNotification(To, Content, type) {
        io.emit(`tostNotification-${To}`, new Notification("Notification", Content, type, '5s'))
    }

    api_router.post('/GeneratePasswordResetOPT', async (req, res) => {
        let n = 0;
        n = crypto.randomInt(100000, 999999)
        let ID = (req.session.UserID) ? req.session.UserID : req.body.ID;
        db.query("Select * from users where Status='Active' and Employee_ID=?", [ID], async (error, result) => {
            if (error) {
                console.log(error)
                return res.status(406).json({ Message: "Unable to find your Details, Try after sometime...!" })
            } else {
                if (result.length > 0) {
                    await SendEmail(result[0].Email_ID, "", `OTP to Reset Your QGPMS Password-${n}`,
                        `<h3>Dear ${result[0].Full_Name},</h3><br>The One Time Password for Setting Password for QGPMS is<b><h2>${n}</h2></b><br>This is OTP will Expire in 5 Min.<br><br><br>Regards`).then(r => {
                            req.session.PWDResetOTP = n;
                            req.session.PWDresetEmail = result[0].Email_ID;
                            req.session.PWDResetUserID = result[0].Employee_ID;
                            res.status(200).json({ Message: "The OTP is sent to your mail" })
                        }).catch(e => {
                            console.error('Error on sending email:', e);
                            req.session.PWDResetOTP = null;
                            res.status(406).json({ Message: "Failed to Generate OTP, Try again...!" })
                        })
                } else {
                    return res.status(406).json({ Message: "Unable to find your Details, Try after sometime...!" })
                }
            }
        })

    });

    api_router.post("/verifyOTP", async (req, res) => {
        if (req.session.UserID || req.session.PWDResetUserID) {
            if (req.body.otp == req.session.PWDResetOTP) {
                io.emit(`notification-${req.session.UserID}`, "OTP Verified Successfully.");
                return res.status(200).send("Verified");
            } else {
                io.emit(`notification-${req.session.UserID}`, "Invalid OTP");
                return res.status(500).send("Invalid OTP");
            }
        } else {
            return res.status(500).send("access denied")
        }
    });

    api_router.post("/GenerateNewPassword", async (req, res) => {
        if (req.session.UserID || req.session.PWDResetUserID) {
            if (req.session.PWDResetOTP == req.body.otp) {
                const RandomPWD = Math.random().toString(36).substring(2, 12);
                bcrypt.hash(RandomPWD, saltRounds).then(async (hash) => {
                    await runQuery("Update users set Password=? where Employee_ID=? and Status='Active'", [hash, req.body.userID]).then(result => {
                        SendEmail(req.session.PWDresetEmail, "", "New Password for QGPMS", `<h3>Hi</h3>
                        The New Login Credentials for QGPMS:<br>
                        <p><b>UserID:</b> ${req.session.PWDResetUserID}</p>
                        <p><b>Password:</b> ${RandomPWD}<br></p></br>
                        <b>Note:</b> After Login Please Change Your Password in the Profile Page.
                        <br><br>--<br>Regards`).then(result => {
                            req.session.PWDResetOTP = null;
                            req.session.PWDResetUserID = null;
                            req.session.PWDresetEmail = null;
                            return res.status(200).json({ Message: "OTP Verification Successful\nNew Password has been shared to you vai Email." })
                        }).catch(Email_Error => {
                            console.error('Error on sending email:', Email_Error);
                            req.session.PWDResetOTP = null;
                            req.session.PWDResetUserID = null;
                            req.session.PWDresetEmail = null;
                            return res.status(406).json({ Message: "Something Went wrong, Unable to Generate New Password." });
                        });
                    }).catch(er => {
                        console.log(er)
                        return res.status(406).json({ Message: "Something Went wrong, Unable to Generate New Password." })
                    });
                })
            } else {
                return res.status(406).json({ Message: "Invalid OTP,Try again...!" })
            }
        } else {
            return res.status(500).send("access denied")
        }
    });

    api_router.post('/uploadNoteRefDoc', (req, res) => {
        upload(req, res, function (err) {
            if (err) {
                if (err?.code == 'LIMIT_FILE_SIZE') {
                    return res.status(400).send("File is too large.\nPlease select the file below 5mb.")
                } else {
                    return res.status(400).send("Unable to upload the file, Try Again...!")
                }
            } else {
                res.send(res.req.file.filename);
            }
        });
    });

    api_router.post('/updateMobileNo', async (req, res, next) => {
        if (req.session.UserID) {
            await runQuery("Update users set Mobile_No=? where Employee_ID=?", [req.body.newMobileNo, req.session.UserID]).then(() => {
                res.status(200).send("Done");
                io.emit(`notification-${req.session.UserID}`, "Mobile No Updated Successfully.");
            }).catch(er => {
                next(er);
                io.emit(`notification-${req.session.UserID}`, "Unable to Update Mobile No.");
            })
        } else {
            res.status(400).send("Access Denied");
        }
    });

    api_router.post('/UpdateProfilePic', async (req, res, next) => {
        if (req.session.UserID) {
            UploadProfilePic(req, res, async function (err) {
                if (err) {
                    if (err?.code == 'LIMIT_FILE_SIZE') {
                        return res.status(400).send("File is too large.\nPlease select the file below 2mb.")
                    } else {
                        return res.status(400).send("Unable to upload the file, Try Again...!")
                    }
                } else {
                    let OldPic = await runQuery("select Profile from users where Employee_ID=?", [req.session.UserID]);
                    OldPic = (OldPic.length > 0) ? OldPic[0].Profile : null;
                    await runQuery("Update users set Profile=? where Employee_ID=?", [res.req.file.filename, req.session.UserID]).then(async () => {
                        const result = await runQuery("select *,DATE_FORMAT(Lastseen,'%c/%d/%y') as n_Lastseen from users where Employee_ID=? and status='Active'", [req.session.UserID]);
                        req.session.UserData = result[0];
                        if (OldPic) {
                            const filepath = path.join(__dirname, '..', 'public', 'uploads', 'Profile', OldPic);
                            const exist = fs.statSync(filepath).isFile();
                            if (exist) {
                                fs.unlinkSync(filepath);
                            }
                        }
                        return res.send(res.req.file.filename);
                    }).catch((er) => {
                        next(er);
                        console.log(er)
                        return res.status(400).send("Unable to upload the file, Try Again...!")
                    });
                }
            })
        } else {
            return res.send(500).send("access denied")
        }
    });

    api_router.post('/updateUserStatus', (req, res) => {
        if (req.session.UserID && req.session.UserRole == "Admin") {
            db.query("update userlogin set Status=? WHERE empId=?", [req.body.params.status, req.body.params.id], (err, result) => {
                if (err) {
                    console.log(err)
                    res.status(400).send(err);
                } else {
                    if (result.changedRows > 0) {
                        db.query("Select *,date_format(lastSeen,'%d-%b-%y/%r') as newLastSeen from userlogin where role!='Admin'  order by employeeName", (error, Data) => {
                            if (error) {
                                console.log(error)
                                res.status(400).send(error);
                            } else {
                                res.status(200).send(Data);
                            }
                        });
                    }
                }
            })

        } else {
            res.status(401).send("Access Denied");
        }
    });

    api_router.get('/DownloadAssessmentReport', (req, res) => {
        if (req.session.UserID && req.session.UserRole != "Employee") {
            let workbook = new excel.Workbook();
            let worksheet = workbook.addWorksheet("Assessment Report");
            try {
                db.query("SELECT R.*,U.* FROM responces R,userlogin U where R.employeeid=U.empId and R.AssessmentID=?;", [req.query.AssessID], async function (error, resultOne) {
                    if (error) throw error;

                    if (resultOne.length > 0) {
                        let MyColumns = [
                            { header: "Submitted Date", key: "date", width: 10 },
                            { header: "Participant Name", key: "employeeName", width: 20 }
                        ]
                        let temp = JSON.parse(resultOne[0].obtainedmarks);

                        for (const attribute in temp) {
                            if (attribute.startsWith("Section")) {
                                MyColumns.push({ header: attribute, key: attribute, width: 10 })

                            }
                        }
                        MyColumns.push(
                            { header: "Secured Marks", key: "TotalScore", width: 5 },
                            { header: "Percentage", key: "SecuredPercentage", width: 5 },
                            { header: "Result", key: "Result", width: 10 },
                            { header: "Remarks", key: "remarks", width: 20 }
                        )
                        worksheet.columns = MyColumns;
                        resultOne.forEach(row => {
                            let temp = JSON.parse(row.obtainedmarks);
                            row.TotalScore = temp.TotalScore;
                            row.SecuredPercentage = temp.SecuredPercentage;
                            for (const attribute in temp) {
                                if (attribute.startsWith("Section")) {
                                    row[attribute] = temp[attribute]
                                }
                            }
                            //console.log(temp.TotalScore)
                            worksheet.addRow(row)
                        })
                        // Set response headers for Excel file download
                        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                        res.setHeader('Content-Disposition', 'attachment; filename=example.xlsx');

                        // Save the Excel file to the response
                        //await workbook.xlsx.write(res);
                        await workbook.xlsx.writeFile("./public/Generated/report.xlsx").then(() => {
                            res.download('./public/Generated/report.xlsx')

                        });
                        // await workbook.xlsx.write(res).then(() => {
                        //     //res.download('./public/Generated/report.xlsx')

                        // });
                    } else {
                        console.log("no data")
                    }
                });
            } catch (error) {
                res.status(401).send(`Internal Server Error:${error}`)
            }

        } else {
            res.status(400).send("Access Denied");
        }

    });

    // api_router.get('/projectInfo/:Customer', (req, res, next) => {

    //     let sqlQuery = '';
    //     let milestoneInfo = `Select *,DATE_FORMAT(Prod_TGT_Start_Date,'%m/%d/%Y') as Prod_TGT_Start_Date,
    //         DATE_FORMAT(Prod_ACT_Start_Date,'%m/%d/%Y') as Prod_ACT_Start_Date,
    //         DATE_FORMAT(Prod_TGT_End_Date,'%m/%d/%Y') as Prod_TGT_End_Date,
    //         DATE_FORMAT(QC_TGT_Start_Date,'%m/%d/%Y') as QC_TGT_Start_Date,
    //         DATE_FORMAT(QC_ACT_Start_Date,'%m/%d/%Y') as QC_ACT_Start_Date,
    //         DATE_FORMAT(QC_TGT_End_Date,'%m/%d/%Y') as QC_TGT_End_Date,
    //         DATE_FORMAT(QC_ACT_End_Date,'%m/%d/%Y') as QC_ACT_End_Date from milestone where Customer=? and Project_ID=?`;
    //     switch (req.params.Customer) {
    //         case 'ATT':
    //             sqlQuery = "select *,DATE_FORMAT(ReceivedDate,'%c/%d/%y') as n_ReceivedDate, DATE_FORMAT(DueDate,'%c/%d/%y') as n_DueDate,DATE_FORMAT(ApprovedDate,'%c/%d/%y') as n_ApprovedDate from attprojects where idProjects=?"
    //             db.query(sqlQuery, [req.query.ID], (error, result) => {
    //                 if (error) {
    //                     console.log(error)
    //                     res.status(400).send("Internal Server Error")
    //                 } else if (result.length > 0) {
    //                     res.status(200).send(result)
    //                 } else {
    //                     res.status(400).send("Data Not Found")
    //                 }
    //             })
    //             break;
    //         case 'Charter':
    //             sqlQuery = "select *,DATE_FORMAT(ReceivedDate,'%c/%d/%y') as n_ReceivedDate, DATE_FORMAT(DueDate,'%c/%d/%y') as n_DueDate,DATE_FORMAT(ApprovedDate,'%c/%d/%y') as n_ApprovedDate from charterprojects where idProjects=?"
    //             db.query(sqlQuery, [req.query.ID], (error, result) => {
    //                 if (error) {
    //                     console.log(error)
    //                     res.status(400).send("Internal Server Error")
    //                 } else if (result.length > 0) {
    //                     res.status(200).send(result)
    //                 } else {
    //                     res.status(400).send("Data Not Found")
    //                 }
    //             })
    //             break;
    //         case 'Comcast':
    //             sqlQuery = "select *,DATE_FORMAT(ReceivedDate,'%c/%d/%y') as n_ReceivedDate, DATE_FORMAT(DueDate,'%c/%d/%y') as n_DueDate,DATE_FORMAT(ApprovedDate,'%c/%d/%y') as n_ApprovedDate from comcastprojects where idProjects=?"
    //             db.query(sqlQuery, [req.query.ID], (error, result) => {
    //                 if (error) {
    //                     console.log(error)
    //                     res.status(400).send("Internal Server Error")
    //                 } else if (result.length > 0) {
    //                     res.status(200).send(result)
    //                 } else {
    //                     res.status(400).send("Data Not Found")
    //                 }
    //             });
    //             break;
    //         case 'Mastec':
    //             sqlQuery = "select *,DATE_FORMAT(ReceivedDate,'%c/%d/%y') as n_ReceivedDate, DATE_FORMAT(DueDate,'%c/%d/%y') as n_DueDate,DATE_FORMAT(ApprovedDate,'%c/%d/%y') as n_ApprovedDate from mastecprojects where JOB_ID=?";
    //             db.query(sqlQuery, [req.query.ID], (error, project) => {
    //                 if (error) {
    //                     next(error)
    //                     res.status(400).send("Internal Server Error")
    //                 } else if (project.length > 0) {
    //                     db.query(milestoneInfo, [req.params.Customer, req.query.ID], (e, milestone) => {
    //                         if (e) {
    //                             next(e);
    //                             console.log(e)
    //                             res.status(400).send("Internal Server Error")
    //                         } else {
    //                             res.status(200).json({ project: project, milestone: milestone })
    //                         }
    //                     });
    //                 } else {
    //                     res.status(400).send("Data Not Found")
    //                 }
    //             });
    //             break;
    //         case 'SkyTec':
    //             sqlQuery = "select *,DATE_FORMAT(ReceivedDate,'%c/%d/%y') as n_ReceivedDate, DATE_FORMAT(DueDate,'%c/%d/%y') as n_DueDate,DATE_FORMAT(ApprovedDate,'%c/%d/%y') as n_ApprovedDate from skytec where JOB_ID=?";
    //             db.query(sqlQuery, [req.query.ID], (error, project) => {
    //                 if (error) {
    //                     next(error)
    //                     res.status(400).send("Internal Server Error")
    //                 } else if (project.length > 0) {
    //                     db.query(milestoneInfo, [req.params.Customer, req.query.ID], (e, milestone) => {
    //                         if (e) {
    //                             next(e);
    //                             console.log(e)
    //                             res.status(400).send("Internal Server Error")
    //                         } else {
    //                             res.status(200).json({ project: project, milestone: milestone })
    //                         }
    //                     });
    //                 } else {
    //                     res.status(400).send("Data Not Found")
    //                 }
    //             });
    //             break;
    //         case 'ATX':
    //             sqlQuery = "select *,DATE_FORMAT(ReceivedDate,'%c/%d/%y') as n_ReceivedDate, DATE_FORMAT(DueDate,'%c/%d/%y') as n_DueDate,DATE_FORMAT(ApprovedDate,'%c/%d/%y') as n_ApprovedDate from atx where JOB_ID=?";
    //             db.query(sqlQuery, [req.query.ID], (error, project) => {
    //                 if (error) {
    //                     next(error)
    //                     res.status(400).send("Internal Server Error")
    //                 } else if (project.length > 0) {
    //                     db.query(milestoneInfo, [req.params.Customer, req.query.ID], (e, milestone) => {
    //                         if (e) {
    //                             next(e);
    //                             console.log(e)
    //                             res.status(400).send("Internal Server Error")
    //                         } else {
    //                             res.status(200).json({ project: project, milestone: milestone })
    //                         }
    //                     });
    //                 } else {
    //                     res.status(400).send("Data Not Found")
    //                 }
    //             });
    //             break;
    //         default:
    //             break;
    //     }
    // })
    function refineKeys(data) {
        const refinedData = {};
        let index = 1;
        for (const key in data) {
            if (Object.hasOwnProperty.call(data, key)) {
                const group = data[key];
                const refinedGroup = {
                    On: group.On,
                    Note: group.Note,
                    Author_ID: group.Author_ID,
                    attachment: group.attachment,
                    Author_Name: group.Author_Name
                };
                refinedData["Group" + index] = refinedGroup;
                index++;
            }
        }
        return refinedData;
    }

    api_router.delete('/deleteComment', async (req, res, next) => {
        const { projectID, commentID, Customer, Target } = req.body;
        isValidCustomer(Customer).then(async isCustomer => {
            try {
                let result, NoteObject;
                if (Target == "Markup") {
                    result = await runQuery("select Comments from markup where Sub_Task_Name=?", [projectID]);
                    NoteObject = JSON.parse(result[0].Comments);
                } else if (Target == "Task") {
                    result = await runQuery("select Comments from task where TaskName=?", [projectID]);
                    NoteObject = JSON.parse(result[0].Comments);
                } else if (Target == "Subtask") {
                    result = await runQuery("select Comments from subtask where SubTaskName=?", [projectID]);
                    NoteObject = JSON.parse(result[0].Comments);
                } else {
                    result = await runQuery(`select Note from ${projectTableNames[Customer].Table} where idProjects=?`, [projectID])
                    NoteObject = JSON.parse(result[0].Note);
                }
                if (NoteObject[commentID]['Author_ID'] == req.session.UserID) {
                    delete NoteObject[commentID];
                    NoteObject = refineKeys(NoteObject);
                    if (Target == "Markup") {
                        await runQuery('update markup set Comments=? where Sub_Task_Name=?', [JSON.stringify(NoteObject), projectID])
                    } else if (Target == "Task") {
                        await runQuery('update task set Comments=? where TaskName=?', [JSON.stringify(NoteObject), projectID])
                    } else if (Target == "Subtask") {
                        await runQuery('update subtask set Comments=? where SubTaskName=?', [JSON.stringify(NoteObject), projectID])
                    } else {
                        await runQuery(`update ${projectTableNames[Customer].Table} set Note=? where idProjects=?`, [JSON.stringify(NoteObject), projectID])
                    }
                    return res.status(200).json({ Message: "Comment Deleted Successfully..!" })
                } else {
                    return res.status(404).send("Access denied you have not allowed to delete this comment");
                }
            } catch (error) {
                console.log(error)
                res.status(400).json({ Message: "Internal Server Error.", Error: error });
            }
        }).catch(er => {
            res.status(400).json({ Message: "Internal Server Error.", Error: error });
        })
    })
    api_router.post('/addComment', async (req, res, next) => {
        let temp = req.body.params;
        let data = {};
        let datetime = new Date();
        let datetimeString = datetime.toLocaleString();
        data.On = datetimeString.replaceAll('/', '-');
        data.Note = temp.Comment;
        data.Author_ID = req.session.UserID;
        data.Author_Name = req.session.UserName;
        data.attachment = temp.attachmentName;
        let idProjects = temp.idProjects;
        isValidCustomer(temp.Customer).then(async isCustomer => {
            await runQuery(`select Note from ${projectTableNames[temp.Customer].Table} where idProjects=?`, [idProjects]).then(async result => {
                if (result.length) {
                    temp = JSON.parse(result[0].Note);
                    temp['NewGroup'] = data;
                    temp = refineKeys(temp);
                    await runQuery(`update ${projectTableNames[req.body.params.Customer].Table} set Note=? where idProjects=?`, [JSON.stringify(temp), idProjects]).then(resultOne => {
                        return res.status(200).send("ok")
                    }).catch(er => {
                        console.log(er)
                        return res.status(404).send("");
                    })
                } else {
                    return res.status(404).send("");
                }
            }).catch(error => {
                console.log(error);
                return res.status(404).send("");
            })
        }).catch(error => {
            return res.status(404).send("");
        })
    });

    api_router.post('/uploadProject/:Customer/:Program', ServerBuffer.single('Project'), async (req, res, next) => {
        let Customer = req.params.Customer;
        let Program = req.params.Program;
        let SOW;
        let temp = await runQuery("Select SOW from customers where Name=?", [["MasTec-Windstream", "MasTec-Comcast"].includes(Program) ? Program : Customer]);
        if (temp.length > 0) {
            SOW = temp[0].SOW.split(',').map(item => item.trim());
        }
        await isValidCustomer(Customer).then(async isCustomer => {
            let insertQuery = `Insert into ${projectTableNames[Customer].Table} set ?`
            try {
                const workbook = xlsx.read(req.file.buffer);
                const sheetName = workbook.SheetNames[0]; // Assuming there's only one sheet
                const sheet = workbook.Sheets[sheetName];
                const data = xlsx.utils.sheet_to_json(sheet, { raw: false, cellDates: true });
                const insertionPromises = [];
                let Notifications = [];
                // Trim all string values in the data
                const trimmedData = data.map(row => {
                    return Object.fromEntries(
                        Object.entries(row).map(([key, value]) => [
                            key,
                            typeof value === "string" ? value.trim().replaceAll(" ", "") : value
                        ])
                    );
                });
                trimmedData.forEach(row => {
                    let receivedDateObject = new Date(row.ReceivedDate);
                    row.ReceivedDate = receivedDateObject.toLocaleDateString('en-CA')
                    let dueDateObject = new Date(row.DueDate);
                    row.DueDate = dueDateObject.toLocaleDateString('en-CA')
                    if (!SOW.includes(row.SOW)) {
                        let projectID;
                        const projectKeys = ['External_ID', 'CFAS_ID', 'JOB_ID'];
                        projectKeys.forEach(key => {
                            if (row.hasOwnProperty(key)) {
                                projectID = row[key];
                                Notifications.push(new Notification("Error...!", `The Project ${projectID} is Rejected.\n Invalid SOW`, 'error', '5s'));
                            }
                        })
                        return;
                    }
                    if (["MasTec-Windstream", "MasTec-Comcast"].includes(Program) && (row?.Job_Name == null || row?.Region == null)) {
                        let projectID;
                        const projectKeys = ['External_ID', 'CFAS_ID', 'JOB_ID'];
                        projectKeys.forEach(key => {
                            if (row.hasOwnProperty(key)) {
                                projectID = row[key];
                                // Notifications.push(new Notification("Error...!", `The Project ${projectID} is Rejected.\n Fill all mandatory fields`, 'error', '5s'));
                                sendTostNotification(req.session.UserID, "Failed to Import the Job " + row[Object.keys(row)[1]] + "\n Fill all mandatory fields", 'error');
                            }
                        })
                        return;
                    }
                    if (dueDateObject < receivedDateObject) {
                        let projectID;
                        const projectKeys = ['External_ID', 'CFAS_ID', 'JOB_ID'];
                        projectKeys.forEach(key => {
                            if (row.hasOwnProperty(key)) {
                                projectID = row[key];
                                // Notifications.push(new Notification("Error...!", `The Project ${projectID} is Rejected.\n Dude date is lesser than Received Date`, 'error', '3s'));
                                sendTostNotification(req.session.UserID, `The Project ${projectID} is Rejected.\n Dude date is lesser than Received Date`, 'error');
                            }
                        })
                        return;
                    }
                    let approvedDateObject = new Date(row.ApprovedDate);
                    if (approvedDateObject != 'Invalid Date') {
                        row.ApprovedDate = approvedDateObject.toISOString().slice(0, 10);
                    } else {
                        row.ApprovedDate = null;
                    }
                    row.Owner = req.session.UserID;
                    row.Note = JSON.stringify({})
                    row.Created_Date = getTimeStamp();
                    const insertionPromise = new Promise((resolve, reject) => {
                        runQuery(insertQuery, [row]).then(result => {
                            resolve(result);
                        }).catch(error => {
                            if (error?.code == "ER_DUP_ENTRY") {
                                sendTostNotification(req.session.UserID, row[Object.keys(row)[1]] + " Job is already exist.", 'verified');
                            } else {
                                console.log(error)
                                sendTostNotification(req.session.UserID, "Failed to Import the Job " + row[Object.keys(row)[1]], 'error');
                            }
                            reject(error)
                        });
                    });
                    insertionPromises.push(insertionPromise);
                });
                Promise.all(insertionPromises).then(() => {
                    Notifications.push(new Notification("Success..!", 'Project Imported Successfully', 'success', '2s'));
                    res.status(200).send(Notifications);
                }).catch((e) => {
                    res.status(500).send("Something Went Wrong While Importing the Projects... \nTry Again..!");
                }).finally(() => {
                    setTimeout(() => {
                        sendTostNotification(req.session.UserID, "All the records processed successfully", 'success');
                    }, 1000);
                })
            } catch (error) {
                console.log(error)
                return res.status(500).send("Something Went Wrong While Importing the Projects... \nTry Again..!");
            }
        }).catch(error => {
            console.log(error)
            return res.status(500).send("Invalid Customer... \nTry Again..!");
        })
    });

    api_router.get('/downloadProjectTemplate/:Customer/:Program', async (req, res, next) => {
        let Customer = req.params.Customer;
        await isValidCustomer(Customer).then(async isCustomer => {
            let Query = `desc ${projectTableNames[Customer].Table}`
            let columns = new Array();
            db.query(Query, async (error, result) => {
                let sensitive = ['idProjects', 'Status', 'Note', 'Owner', 'ApprovedDate', 'SubmittedDate', 'Total_Footage', 'Total_Home_Passing', 'Total_Actives', 'Created_Date', 'Arial', 'Buried', 'Total_Est', 'Real_End']
                if (["MasTec-Windstream", "MasTec-Comcast"].includes(req.params.Program)) {
                    sensitive = sensitive.concat(['Worktype', 'Division', 'No_Nodes', "Aerial", "No_ROLTs", "Market_ID", "Market_Order", "Project_No", "DANumber", "Exchange", "WONumber", "EPMCode"])
                }
                if (req.params.Program == "MasTec-Comcast") {
                    sensitive = sensitive.filter(item => item != "Market_ID" && item != "Project_No")
                }
                if (error) {
                    next(error);
                } else {
                    result.forEach(element => {
                        columns.push(element.Field)
                    });
                }
                try {
                    columns = columns.filter(item => !sensitive.includes(item));
                    const worksheet = xlsx.utils.aoa_to_sheet([columns])
                    const workbook = xlsx.utils.book_new();
                    xlsx.utils.book_append_sheet(workbook, worksheet, `${req.params.Program}-Template`);
                    const excelBuffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
                    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                    res.setHeader('Content-Disposition', `attachment; filename=${req.params.Customer}-Template.xlsx`);
                    res.send(Buffer.from(excelBuffer));
                } catch (error) {
                    next(error)
                }
            })
        }).catch(er => {
            next(er)
        })
    });

    api_router.get('/getUserData', (req, res, next) => {
        db.query('select * from users where Employee_ID=?', [req.query.UserID], (error, result) => {
            if (error) {
                next(error)
            } else {
                return res.json(result[0]);
            }
        });
    });

    api_router.get('/downloadCustomersTemplate', async (req, res, next) => {
        let columns = new Array();
        db.query('desc customers', async (error, result) => {
            let sensitive = ['idCustomers', 'Created_Date', 'Updated_Date', 'Point_of_Contact', 'Logo']
            if (error) {
                next(error)
            } else {
                result.forEach(element => {
                    columns.push(element.Field)
                });
            }
            try {
                columns = columns.filter(item => !sensitive.includes(item));
                const worksheet = xlsx.utils.aoa_to_sheet([columns])
                const workbook = xlsx.utils.book_new();
                xlsx.utils.book_append_sheet(workbook, worksheet, `${req.params.Customer}-Template`);
                const excelBuffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename=QGPMS-Customer-Template.xlsx`);
                res.send(Buffer.from(excelBuffer));
            } catch (error) {
                next(error)
            }
        });
    });

    api_router.post('/uploadCustomers', ServerBuffer.single('Customers'), (req, res, next) => {
        try {
            const workbook = xlsx.read(req.file.buffer);
            const sheetName = workbook.SheetNames[0]; // Assuming there's only one sheet
            const sheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(sheet, { raw: false, cellDates: true });
            const insertionPromises = [];
            let Notifications = [];
            data.forEach(row => {
                row.Created_Date = new Date().toISOString().slice(0, 10)
                const insertionPromise = new Promise((resolve, reject) => {
                    db.query('insert into customers set ?', [row], (error, result) => {
                        if (error) {
                            console.log(error)
                            reject(error)
                        } else {
                            resolve(result);
                        }
                    });
                });
                insertionPromises.push(insertionPromise);
            });
            Promise.all(insertionPromises).then(() => {
                Notifications.push(new Notification("Success..!", 'Customers Imported Successfully', 'success', '2s'));
                res.status(200).send(Notifications);

            }).catch((e) => {
                console.log(e)
                next(e)
                return res.status(500).send("Something Went Wrong While Importing the Customers Data... \nTry Again..!");
            })
        } catch (error) {
            next(error);
            console.log(error)
        }
    });

    api_router.get('/getCustomerData', (req, res, next) => {
        db.query('select * from customers where idCustomers=?', [req.query.CustomerID], (error, result) => {
            if (error) {
                res.status(400).json({ message: "Something went Wrong Unable to fetch the Customer Data" })
                next(error)
            } else {
                return res.json(result[0]);
            }
        })
    });

    api_router.post('/updateSOW', (req, res, next) => {
        db.query('update customers set SOW=? where idCustomers=?', [req.body.SOW, req.body.CustomerID], (error, result) => {
            if (error) {
                //console.log(error);
                res.status(400).json({ message: "Something went Wrong Unable to update the SOW" })
                next(error);
            } else {
                return res.status(200).json({ message: 'SOW Updated Successfully...' })
            }
        })
    });

    api_router.post('/updateWT', (req, res, next) => {
        db.query('update customers set WorkType=? where idCustomers=?', [req.body.WT, req.body.CustomerID], (error, result) => {
            if (error) {
                //console.log(error);
                res.status(400).json({ message: "Something went Wrong Unable to update the Work Type" })
                next(error);
            } else {
                return res.status(200).json({ message: 'Work Type Updated Successfully...' })
            }
        })
    });
    api_router.post('/updateML', (req, res, next) => {
        db.query('update customers set Milestone=? where idCustomers=?', [req.body.ML, req.body.CustomerID], (error, result) => {
            if (error) {
                //console.log(error);
                res.status(400).json({ message: "Something went Wrong Unable to update the Milestone" })
                next(error);
            } else {
                return res.status(200).json({ message: 'Milestone Updated Successfully...' })
            }
        })
    })

    api_router.get('/getNotification', (req, res) => {
        if (req.session.UserID) {
            db.query('select *,DATE_FORMAT(created_at,"%m/%d/%y %T") as created_at from notifications where Employee_Id=? and is_read="0" order by created_at desc', [req.session.UserID], (error, result) => {
                return res.status(200).send(result);
            });
        }
    });

    api_router.post('/markNotificationAsRead', (req, res) => {
        if (req.session.UserID) {
            db.query('update notifications set is_read=1 where Employee_Id=?', [req.session.UserID], (error, result) => {
                if (error) {
                    return res.status(500)
                } else {
                    return res.status(200).send(result)
                };
            });
        }
    });

    api_router.post('/updateTimeLog/:Task/:type', async (req, res, next) => {
        if (req.session.UserID) {
            let type, isSubtask = false;
            const Task = await runQuery('select * from task where TaskName=? limit 1', [req.params.Task]);
            const SubTask = await runQuery('select * from subtask where SubTaskName=? limit 1', [req.params.Task]);
            const Markup = await runQuery("select * from markup where Sub_Task_Name=? limit 1", [req.params.Task]);
            try {
                if (Task.length > 0) {
                    type = Task[0].Type;
                }
                if (SubTask.length > 0) {
                    type = SubTask[0].Type;
                    isSubtask = true;
                }
                if (Markup.length > 0) {
                    type = "Markup";
                }
                let data, Status, Milestone_Status = "WIP", QC_ACT_Start_Date = null, Prod_ACT_Start_Date = null;
                let time = getTimeStamp();
                let ProjectDetails = await runQuery("select Customer,idProjects,Project_ID,Milestone_Name from milestone where Milestone_Name in (select Milestone_Name from task where TaskName=?)", [req.params.Task]);
                if (ProjectDetails.length == 0 && isSubtask) {
                    ProjectDetails = await runQuery("select Customer,idProjects,Project_ID,Milestone_Name from milestone where Milestone_Name in (select Milestone_Name from subtask where SubTaskName=?)", [req.params.Task]);
                }
                if (req.params.type == 'start') {
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
                        return res.status(500).json({ "OngoingTaskInfo": TaskInfo[0] });
                    }
                    let temp = "";
                    if (req.params.Task.startsWith("SUB")) {
                        temp = await runQuery("select *  from subtask where SubTaskName=? and Owner=?", [req.params.Task, req.session.UserID]);
                    } else if (req.params.Task.startsWith("MKUP")) {
                        temp = await runQuery("select * from markup where Sub_Task_Name=? and Owner=?", [req.params.Task, req.session.UserID])
                    } else {
                        temp = await runQuery("select * from task where TaskName=? and Owner=?", [req.params.Task, req.session.UserID]);
                    }
                    if (Array.isArray(temp) && temp.length == 0) {
                        return res.status(400).send("Owner Changed");
                    }
                    const log = {
                        TaskName: req.params.Task,
                        startTime: time,
                        UserID: req.session.UserID
                    }
                    if (type == 'IQC' || type == 'RQC' || type == 'CQC' || type == 'USQC') {
                        QC_ACT_Start_Date = time;
                    } else if (type == "Production") {
                        Prod_ACT_Start_Date = time;
                    } else if (type == "Markup") {
                        await runQuery("update markup set Status= CASE WHEN Status='YTS' THEN 'WIP' ELSE Status END ,StartDate=CASE WHEN StartDate IS NULL THEN ? ELSE StartDate END WHERE Sub_Task_Name=?", [time, req.params.Task]);
                    }
                    if (isSubtask) {
                        await runQuery("update subtask set Status= CASE WHEN Status='YTS' THEN 'WIP' ELSE Status END ,StartDate=CASE WHEN StartDate IS NULL THEN ? ELSE StartDate END WHERE SubTaskName=?", [time, req.params.Task]);
                        await runQuery("update task set Status= CASE WHEN Status='YTS' THEN 'WIP' ELSE Status END ,StartDate=CASE WHEN StartDate IS NULL THEN ? ELSE StartDate END WHERE TaskName=(select Task_Name from subtask where SubTaskName=?)", [time, req.params.Task]);
                        await runQuery("update milestone m join task t on t.Milestone_Name=m.Milestone_Name  set Milestone_Status= CASE WHEN Milestone_Status='YTS' THEN 'WIP' ELSE Milestone_Status END,Prod_ACT_Start_Date= CASE WHEN Prod_ACT_Start_Date IS NULL THEN ? ELSE Prod_ACT_Start_Date END,QC_ACT_Start_Date= CASE WHEN QC_ACT_Start_Date IS NULL THEN ? ELSE QC_ACT_Start_Date END where t.TaskName=(select Task_Name from subtask where SubTaskName=?) ", [Prod_ACT_Start_Date, QC_ACT_Start_Date, req.params.Task]);
                        if (SubTask[0].Prod_Sub_Task != null && SubTask[0].Type == "IQC" || SubTask[0].Type == "RQC") {
                            await runQuery("update subtask set Status= CASE WHEN Status='IQC-YTS' THEN 'IQC-WIP' ELSE Status END WHERE SubTaskName=?", [SubTask[0].Prod_Sub_Task]);
                        }
                    }
                    if (type != "Markup" && isSubtask == false) {
                        if (type == "CQC") {
                            await runQuery("update milestone m join task t on t.Milestone_Name=m.Milestone_Name set Milestone_Status= CASE WHEN Milestone_Status='CQC-YTS' THEN 'CQC-WIP' ELSE Milestone_Status END,Prod_ACT_Start_Date= CASE WHEN Prod_ACT_Start_Date IS NULL THEN ? ELSE Prod_ACT_Start_Date END,QC_ACT_Start_Date= CASE WHEN QC_ACT_Start_Date IS NULL THEN ? ELSE QC_ACT_Start_Date END where t.TaskName=? ", [Prod_ACT_Start_Date, QC_ACT_Start_Date, req.params.Task]);
                        } else if (type == "USQC") {
                            await runQuery("update milestone m join task t on t.Milestone_Name=m.Milestone_Name set Milestone_Status= CASE WHEN Milestone_Status='USQC-YTS' THEN 'USQC-WIP' ELSE Milestone_Status END,Prod_ACT_Start_Date= CASE WHEN Prod_ACT_Start_Date IS NULL THEN ? ELSE Prod_ACT_Start_Date END,QC_ACT_Start_Date= CASE WHEN QC_ACT_Start_Date IS NULL THEN ? ELSE QC_ACT_Start_Date END where t.TaskName=? ", [Prod_ACT_Start_Date, QC_ACT_Start_Date, req.params.Task]);
                        } else {
                            await runQuery("update milestone m join task t on t.Milestone_Name=m.Milestone_Name set Milestone_Status= CASE WHEN Milestone_Status='YTS' THEN 'WIP' ELSE Milestone_Status END,Prod_ACT_Start_Date= CASE WHEN Prod_ACT_Start_Date IS NULL THEN ? ELSE Prod_ACT_Start_Date END,QC_ACT_Start_Date= CASE WHEN QC_ACT_Start_Date IS NULL THEN ? ELSE QC_ACT_Start_Date END where t.TaskName=? ", [Prod_ACT_Start_Date, QC_ACT_Start_Date, req.params.Task]);
                        }
                        await runQuery("update task set Status= CASE WHEN Status='YTS' THEN 'WIP' ELSE Status END ,StartDate=CASE WHEN StartDate IS NULL THEN ? ELSE StartDate END WHERE TaskName=?", [time, req.params.Task]);
                        let temp = await runQuery(`Update ${projectTableNames[ProjectDetails[0].Customer].Table} set Status="WIP" where ${projectTableNames[ProjectDetails[0].Customer].ProjectColumn}=? and idProjects=?`, [ProjectDetails[0].Project_ID, ProjectDetails[0].idProjects]);
                        if ((type == "IQC" || type == "RQC") && (Task[0].Prod_Task != null || Task[0].Prod_Task != "")) {
                            await runQuery("update task set Status='IQC-WIP' WHERE TaskName=?", [Task[0].Prod_Task]);
                        }
                    }
                    if (activeSession.length == 0) {
                        await runQuery("Insert into timesheet set ?", [log]).then(async result => {
                            io.emit("UpdateTaskStatus", { TaskName: req.params.Task, Active: true });
                            return res.status(200).send(await runQuery('select * from timesheet where TaskName=? and UserID=?', [req.params.Task, req.session.UserID]))
                        }).catch(er => {
                            return res.status(400).send(er)
                        });
                    }
                } else if (req.params.type == 'stop') {
                    await runQuery("update timesheet set endTime=?,duration=TIMESTAMPDIFF(SECOND, startTime, ?) where TaskName=? and UserID=? ORDER BY idtimesheet DESC LIMIT 1", [time, time, req.params.Task, req.session.UserID]);
                    if (type == "Markup") {
                        await runQuery("update markup set TotalTime=(select sum(duration) from timesheet where TaskName=?) where Sub_Task_Name=?;", [req.params.Task, req.params.Task]);
                    }
                    if (isSubtask) {
                        await runQuery("update subtask set TotalTime=(select sum(duration) from timesheet where TaskName=?) WHERE SubTaskName=?", [req.params.Task, req.params.Task]);
                    }
                    if (type != "Markup") {
                        await runQuery("update task set TotalTime=(select sum(duration) from timesheet where TaskName=?) where TaskName=?;", [req.params.Task, req.params.Task]);
                        //await runQuery("update milestone m join task t on t.Milestone_Name=m.Milestone_Name  set ? where t.TaskName=? ", [data, req.params.Task]);
                        //await runQuery(`Update ${projectTableNames[ProjectDetails[0].Customer].Table} set Status=? where ${projectTableNames[ProjectDetails[0].Customer].ProjectColumn}=?`, [Status, ProjectDetails[0].Project_ID]);
                    }
                    io.emit("UpdateTaskStatus", { TaskName: req.params.Task, Active: false });
                    return res.status(200).send(await runQuery('select * from timesheet where TaskName=? and UserID=?', [req.params.Task, req.session.UserID]))
                }
            } catch (error) {
                console.log(error);
                return res.status(400).send(error)
            } finally {
                io.emit(`AutoRefresh-${req.session.UserID}`, "Refresh")
            }
        } else {
            return res.status(400).send("Access Denied")
        }
    });

    api_router.post('/updateTechInfo/:TaskName', async (req, res, next) => {
        if (req.session.UserID) {
            try {
                const data = (req.body);
                let result = await runQuery("update task set TechInfo=? where TaskName=? and Status!='Completed' and Owner=?", [JSON.stringify(data.values), req.params.TaskName, req.session.UserID]);
                if (result.affectedRows > 0) {
                    let customer = await runQuery("select M.Customer,M.Project_ID,M.idProjects from milestone as M inner join task T on M.Milestone_Name=T.Milestone_Name where T.TaskName=?", [req.params.TaskName]);
                    if (customer[0].Customer) {
                        await runQuery(`update ${projectTableNames[customer[0].Customer].Table} set ? where ${projectTableNames[customer[0].Customer].ProjectColumn}=? and idProjects=?`, [data.values, customer[0].Project_ID, customer[0].idProjects]);
                    }
                    return res.status(200).json({ Message: "Saved Successfully.", Notification: new Notification('Success..!', "Info Saved Successfully.", 'success', '2s') })
                } else {
                    return res.status(400).json({ Message: "Your Not Authorized to Update this Tech Info.", Notification: new Notification('Error..!', "Your Not Authorized to Update this Tech Info.", 'error', '5s') });
                }
            } catch (error) {
                console.log(error)
                return res.status(400).json({ Message: "Something went wrong.\nTry again.", Notification: new Notification('Error..!', "Something went wrong.\nTry again.", 'error', '2s') });
            }
        } else {
            return res.status(400).json({ Message: "Access Denied.", Notification: new Notification('Error..!', "Access Denied.", 'error', '2s') })
        }
    });

    api_router.post('/MarkTaskCompleted/:task/:Type', async (req, res, next) => {
        if (req.session.UserID) {
            let type, result, ProjectDetails, TaskInfo;
            const { Iteration, Score } = (req.body);
            const category = req.params.Type;
            let time = getTimeStamp();
            try {
                if (category == "Task") {
                    type = await runQuery('select Type from task where TaskName=? limit 1', [req.params.task]);
                    TaskInfo = await runQuery('SELECT T.*,m.Owner as Milestone_Owner FROM task T inner join milestone m where T.Milestone_Name=m.Milestone_Name and T.TaskName=?', [req.params.task]);
                    let SubtaskStatus = await runQuery("select count(*) as PendingSubtask from subtask where Task_Name=? and Status!='Completed'", [req.params.task]);
                    if (SubtaskStatus[0].PendingSubtask > 0) {
                        req.session.Notifications = JSON.stringify(new Notification('Error..!', `All subtasks must be completed to submit`, 'error', '3s'));
                        return res.status(400).json({ Message: "Subtask Not Completed.", Notification: new Notification('Error..!', `All subtasks must be completed to submit`, 'error', '3s') });
                    }
                    ProjectDetails = await runQuery("select idProjects,Customer,Project_ID,Milestone_Name,Owner from milestone where Milestone_Name in (select Milestone_Name from task where TaskName=?)", [req.params.task]);
                } else if (category == "Subtask") {
                    type = await runQuery('select Type from subtask where SubTaskName=? limit 1', [req.params.task]);
                    TaskInfo = await runQuery("SELECT S.* FROM subtask S inner join milestone M where S.Milestone_Name=M.Milestone_Name and S.SubTaskName=?", [req.params.task]);
                    ProjectDetails = await runQuery("select idProjects,Project_ID,Owner from task where TaskName=(select Task_Name from subtask where SubTaskName=?)", [req.params.task]);
                }
                let MarkupStatus = await runQuery("select count(*) as PendingMarkup from markup where Task_Name=? and Status!='Completed'", [req.params.task]);
                if (MarkupStatus[0].PendingMarkup > 0) {
                    req.session.Notifications = JSON.stringify(new Notification('Error..!', `All markup must be completed to submitted`, 'error', '3s'));
                    return res.status(400).json({ Message: "Markup Not Completed.", Notification: new Notification('Error..!', `All markup must be completed to submitted`, 'error', '3s') });
                } else {
                    type = type[0].Type;
                    let data, Status = "WIP", QC_ACT_End_Date = null, Milestone_Status = "WIP", Prod_ACT_End_Date = null;
                    TaskInfo = TaskInfo[0];
                    const Production = await runQuery('select Count(*) as OngoingTaskCount from task where Milestone_Name=? and Status!="Completed" and Type=?', [TaskInfo.Milestone_Name, "Production"]);
                    if (Production[0].OngoingTaskCount == 1) {
                        Prod_ACT_End_Date = time;
                        Milestone_Status = "WIP"
                    }
                    const QC = await runQuery('select Count(*) as OngoingTaskCount from task where Milestone_Name=? and Status!="Completed" and Type in ("IQC","RQC")', [TaskInfo.Milestone_Name]);
                    if (QC[0].OngoingTaskCount == 1) {
                        QC_ACT_End_Date = time;
                    }
                    if (category == "Subtask") {
                        result = await runQuery("update subtask set status='Ready for QC',EndDate=? where Status='WIP' and Owner=? and SubTaskName=?", [time, req.session.UserID, req.params.task]);
                        if (result.affectedRows > 0 && TaskInfo.Type == "Production" && TaskInfo.autoQC == 1) {
                            let dueDateObject = new Date(TaskInfo.QC_Due_Date);
                            dueDateObject = (new Date(dueDateObject.setDate(dueDateObject.getDate() + 1)).toISOString().slice(0, 10));
                            let temp = await runQuery("select Count(*) as counter from subtask;");
                            temp = temp[0].counter + 1;
                            temp = String(temp).padStart(7, '0');
                            let ParentTask = await runQuery("Select * from task where idTask=?", [TaskInfo.idTask]);
                            let Data = {
                                Owner: ParentTask[0].Owner,
                                Due_Date: dueDateObject,
                                SubTaskLabel: TaskInfo.SubTaskLabel + "-QC",
                                SubTaskName: 'SUB-'.concat(temp),
                                Remark: '',
                                Milestone_Name: TaskInfo.Milestone_Name,
                                idProjects: TaskInfo.idProjects,
                                idTask: TaskInfo.idTask,
                                Task_Name: TaskInfo.Task_Name,
                                Project_ID: TaskInfo.Project_ID,
                                Type: "IQC",
                                QC_Name: TaskInfo.QC_Name,
                                Created_Date: time,
                                Created_By: req.session.UserID,
                                Comments: '{}',
                                Prod_Sub_Task: TaskInfo.SubTaskName
                            }
                            await runQuery("insert into subtask set ?", [Data]).then(async () => {
                                result = await runQuery("update subtask set status='IQC-YTS',EndDate=? where Status='Ready for QC' and Owner=? and SubTaskName=?", [time, req.session.UserID, req.params.task]);
                                sendNotification(Data.Owner, `New Subtask Assignment: "${Data.SubTaskLabel}"`);
                                runQuery("select * from users where Employee_ID=?", [Data.Owner]).then(async data => {
                                    if (data.length > 0) {
                                        await SendEmail(data[0].Email_ID, "", `New Subtask Assignment: ${data.SubTaskName}`, `<div style="font-size:14px">
                                            <p>Dear <b>${data[0].Full_Name}</b>,</p>
                                            <p>Please be informed that the following new subtask has been assigned to you.</p>
                                            <hr>
                                            <p><b>Subtask Name: </b><a href='${getBaseURL(req)}/SubTask/${Data.SubTaskName}'>${Data.SubTaskName}</a></p>
                                            <p><b>Task Name: </b>${Data.Task_Name}</p>
                                            <hr>
                                            <p>Please ensure timely completion of this subtask.</p>
                                        </div>`);
                                    }
                                });
                            }).catch(e => {
                                console.log(e)
                                req.session.Notifications = JSON.stringify(new Notification('Error!', 'Internal Sever Error, Unable to Create the QC Task automatically.', 'error', '10s'));
                                return res.status(400).json({ Message: "Something went wrong.\nTry again.", Notification: new Notification('Error..!', "Something went wrong.\nTry again.", 'error', '2s') });
                            });
                        } else if (TaskInfo.Type != "Production" && TaskInfo.Prod_Sub_Task != null) {
                            result = await runQuery("update subtask set status='Completed',EndDate=? where Owner=? and SubTaskName=?", [time, req.session.UserID, req.params.task]);
                            await runQuery("update subtask set  status=CASE WHEN status='IQC-WIP' THEN 'Completed' ELSE status END  where  SubTaskName=?", [TaskInfo.Prod_Sub_Task]);
                        } else {
                            result = await runQuery("update subtask set status='Completed',EndDate=?,Iteration=?,Score=? where Owner=? and SubTaskName=?", [time, Iteration, Score, req.session.UserID, req.params.task]);
                        }
                    } else if (category == "Task") {
                        if (TaskInfo.Type == "Production") {
                            let tempStatus = TaskInfo.QC_Name ? "Ready for QC" : "Completed";
                            result = await runQuery("update task set status=?,EndDate=?,Iteration=?,Score=? where Status='WIP' and Owner=? and TaskName=?", [tempStatus, time, Iteration, Score, req.session.UserID, req.params.task]);
                            if (result.affectedRows > 0 && TaskInfo.autoQC == 1 && TaskInfo.QC_Due_Date != "") {
                                let dueDateObject = new Date(TaskInfo.QC_Due_Date);
                                dueDateObject = (new Date(dueDateObject.setDate(dueDateObject.getDate() + 1)).toISOString().slice(0, 10));
                                let Milestone = TaskInfo.Milestone_Name
                                let ID = TaskInfo.idProjects;
                                let Type = 'IQC';
                                const result = await runQuery("select Count(*) as counter from task where Type=?", [Type]);
                                const projectID = await runQuery("select Project_ID,Customer,Owner from milestone where Milestone_Name=? and idProjects=?", [Milestone, ID]);
                                let temp = result[0].counter + 1;
                                temp = String(temp).padStart(7, '0');
                                const Data = {
                                    idProjects: ID,
                                    TaskName: Type.slice(0, 4).toLocaleUpperCase('en-US') + '-' + temp,
                                    Milestone_Name: Milestone,
                                    Project_ID: projectID[0].Project_ID,
                                    Type: Type,
                                    QC_Name: TaskInfo.QC_Name ? TaskInfo.QC_Name : null,
                                    Owner: projectID[0].Owner,
                                    TaskLabel: TaskInfo.TaskLabel + "-IQC",
                                    Created_Date: getTimeStamp(),
                                    Created_By: req.session.UserID,
                                    Comments: '{}',
                                    TechInfo: '{}',
                                    Prod_Task: TaskInfo.TaskName,
                                    DueDate: dueDateObject
                                }
                                let MilestoneInfo = await runQuery("select * from milestone where Milestone_Name=?", [Milestone]);
                                await runQuery("insert into task set ?", [Data]).then(async data => {
                                    await runQuery("Update milestone set Milestone_Status='WIP' where Milestone_Name=? and idProjects=?", [Milestone, ID]);
                                    await runQuery("update task set Status='IQC-YTS' where Type='Production' and TaskName=? and Project_ID=? and idProjects=?", [TaskInfo.Prod_Task, Data.Project_ID, Data.idProjects])
                                    sendNotification(Data.Owner, `New Task Assignment: ${Data.TaskName}`);
                                    runQuery("select * from users where Employee_ID=?", [Data.Owner]).then(async data => {
                                        if (data.length > 0) {
                                            await SendEmail(data[0].Email_ID, "", `New Task Assignment: ${Data.TaskName}`, `<div style="font-size:14px">
                                          <p>Dear <b>${data[0].Full_Name}</b>,</p>
                                          <p>Please be informed that the following new task has been assigned to you.<p>
                                          <hr>
                                          <p><b>Task Name: </b><a href='${getBaseURL(req)}/ViewTask/${MilestoneInfo[0].Customer}/${Data.Milestone_Name}/${Data.TaskName}'>${Data.TaskName}</a></p>
                                          <p><b>Milestone Name: </b><a href='${getBaseURL(req)}/ViewMilestone/${MilestoneInfo[0].Customer}/${MilestoneInfo[0].idProjects}/${Data.Milestone_Name}'>${Data.Milestone_Name}</a></p>
                                          <hr>
                                          <p>Please ensure timely completion of this task.</p>
                                      </div>`);
                                        }
                                    });
                                }).catch(error => {
                                    console.log(error);
                                });
                            }
                        } else {
                            result = await runQuery("update task set status='Completed',EndDate=?,Iteration=?,Score=? where Status='WIP' and Owner=? and TaskName=?", [time, Iteration, Score, req.session.UserID, req.params.task]);
                            if ((TaskInfo.Type == "IQC" || TaskInfo.Type == "RQC") && (TaskInfo.Prod_Task != null || TaskInfo.Prod_Task != "")) {
                                await runQuery("update task set status='Completed' where Status='IQC-WIP' and TaskName=?", [TaskInfo.Prod_Task]);
                            } else if (TaskInfo.Type == "CQC") {
                                Milestone_Status = "CQC-Completed"
                            } else if (TaskInfo.Type == "USQC") {
                                Milestone_Status = "USQC-Completed"
                            }
                        }
                        const AllTask = await runQuery('select Count(*) as OngoingTaskCount from task where Milestone_Name=? and Status!="Completed"', [TaskInfo.Milestone_Name]);
                        if (AllTask[0].OngoingTaskCount == 0) {
                            Milestone_Status = "Completed"
                        }
                        data = {
                            QC_ACT_End_Date: QC_ACT_End_Date,
                            Milestone_Status: Milestone_Status,
                            Prod_ACT_End_Date: Prod_ACT_End_Date
                        }
                        await runQuery("update milestone m join task t on t.Milestone_Name=m.Milestone_Name  set ? where t.TaskName=?", [data, req.params.task]);
                        await runQuery(`Update ${projectTableNames[ProjectDetails[0].Customer].Table} as P set P.Status="Completed" where P.${projectTableNames[ProjectDetails[0].Customer].ProjectColumn}=? and P.idProjects=? and (select count(*) from milestone m where m.idProjects=? and m.Project_ID=?)=(select count(*) from milestone m where m.idProjects=? and m.Project_ID=?  and m.Milestone_Status='Completed')`, [ProjectDetails[0].Project_ID, ProjectDetails[0].idProjects, ProjectDetails[0].idProjects, ProjectDetails[0].Project_ID, ProjectDetails[0].idProjects, ProjectDetails[0].Project_ID]);
                    }
                    if (result.affectedRows > 0) {
                        await runQuery("select * from users where Employee_ID=?", [ProjectDetails[0].Owner]).then(async data => {
                            // If Milestone Owner Exists 
                            if (data.length > 0) {
                                await sendNotification(data[0].Employee_ID, `Task Completed: ${req.params.task} in Milestone ${TaskInfo.Milestone_Name}`).then(async () => {
                                    await SendEmail(data[0].Email_ID, "", `Task Completed: ${req.params.task} in Milestone ${TaskInfo.Milestone_Name}`, `<div style="font-size:14px">
                                    <p>Dear <b>${data[0].Full_Name}</b>,</p>
                                    <p>Please be informed that the following task has been completed.</p>
                                    <hr>
                                    <p><b>Task Name: </b>${req.params.task}</p>
                                    <p><b>Milestone Name: </b>${TaskInfo.Milestone_Name}</p>
                                    </div>`);
                                })
                            }
                        });
                        req.session.Notifications = JSON.stringify(new Notification('Success..!', `Task ${req.params.task} successfully submitted.`, 'success', '3s'));
                        return res.status(200).json({ Message: "Submitted.", Notification: new Notification('Success..!', `Task ${req.params.task} successfully submitted.`, 'success', '3s') });
                    }
                    else {
                        req.session.Notifications = JSON.stringify(new Notification('Error..!', `Unable to submit the task ${req.params.task}.`, 'error', '3s'));
                        return res.status(400).json({ Message: "Submitted.", Notification: new Notification('Error..!', `Unable to submit the task ${req.params.task}.`, 'error', '3s') });
                    }
                }
            } catch (error) {
                console.log(error)
                return res.status(400).json({ Message: "Something went wrong.\nTry again.", Notification: new Notification('Error..!', "Something went wrong.\nTry again.", 'error', '2s') });
            } finally {
                //  io.emit(`AutoRefresh-${req.session.UserID}`, "Refresh")
            }
        } else {
            return res.status(400).json({ Message: "Access Denied.", Notification: new Notification('Error..!', "Access Denied.", 'error', '2s') })
        }
    });

    api_router.post('/MarkMarkupCompleted/:MarkupName', async (req, res, next) => {
        if (req.session.UserID) {
            try {
                let time = getTimeStamp();
                let InputData = {
                    EndDate: time,
                    Status: 'Completed'
                }
                let Owner, SuperOwner, temp, Task;
                const markupInfo = await runQuery("Select * from markup where Sub_Task_Name=?", [req.params.MarkupName]);
                if (markupInfo[0].MarkupFor == "Task") {
                    temp = await runQuery("select T.*,M.Owner as milestoneOwner from task T inner join milestone M  on T.Milestone_Name=M.Milestone_Name where T.Milestone_Name=? and T.TaskName=?;", [markupInfo[0].Milestone_Name, markupInfo[0].Task_Name]);
                    Owner = temp[0].Owner;
                    SuperOwner = temp[0].milestoneOwner;
                    //await runQuery("update task set TotalTime=(select sum(duration) from timesheet where TaskName=?) where TaskName=?;",[markupInfo[0].Task_Name,markupInfo[0].Task_Name]);
                } else if (markupInfo[0].MarkupFor == "Subtask") {
                    temp = await runQuery("select s.Owner as Owner, T.Owner as SuperOwner,s.SubTaskName as SubTaskName from subtask s inner join task T where s.Task_Name=T.TaskName and s.SubTaskName=(select Task_Name from markup where Sub_Task_Name=?)", [req.params.MarkupName]);
                    Owner = temp[0].Owner;
                    SuperOwner = temp[0].SuperOwner;
                    //await runQuery("update subtask set TotalTime=(select sum(duration) from timesheet where TaskName=?) WHERE SubTaskName=?", [req.params.MarkupName, markupInfo[0].SubTaskName]);
                }
                await runQuery("select * from users where Employee_ID=?", [SuperOwner]).then(async milestoneOwner => {
                    await runQuery("select * from users where Employee_ID=?", [Owner]).then(async data => {
                        await runQuery("update markup set ? where Status='WIP' and Owner=? and Sub_Task_Name=?", [InputData, req.session.UserID, req.params.MarkupName]);
                        await sendNotification(data[0].Employee_ID, `${req.session.UserName} has completed the Markup ${req.params.MarkupName} in ${markupInfo[0].Task_Name}`).then(async () => {
                            await SendEmail(data[0].Email_ID, milestoneOwner[0].Email_ID, `Task Completed: ${req.params.MarkupName} in ${markupInfo[0].Milestone_Name}`, `<div style="font-size:14px">
                                        <p>Dear <b>${data[0].Full_Name}</b>,</p>
                                        <p>Please be informed that the following markup task has been completed.</p>
                                        <hr>
                                        <p><b>Markup Task: </b> <a href='${getBaseURL(req)}/Markup/${req.params.MarkupName}'>${req.params.MarkupName}</a></p>
                                        <p><b>Milestone Name: </b> ${markupInfo[0].Milestone_Name} </p>
                                        </div>`);
                        })
                    });
                });
                req.session.Notifications = JSON.stringify(new Notification('Success..!', `Markup Task ${req.params.MarkupName} successfully submitted.`, 'success', '3s'));
                return res.status(200).json({ Message: "Submitted.", Notification: new Notification('Success..!', `Markup Task ${req.params.MarkupName} successfully submitted.`, 'success', '2s') })
            } catch (error) {
                console.log(error);
                return res.status(400).json({ Message: "Something went wrong.\nTry again.", Notification: new Notification('Error..!', "Something went wrong.\nTry again.", 'error', '2s') });
            } finally {
                io.emit(`AutoRefresh-${req.session.UserID}`, "Refresh")
            }
        } else {
            return res.status(400).json({ Message: "Access Denied.", Notification: new Notification('Error..!', "Access Denied.", 'error', '2s') })
        }
    });

    function secondsToMinutes(seconds) {
        let minutes = Math.floor(seconds / 60);
        let remainingSeconds = seconds % 60;
        if (isNaN(minutes)) {
            minutes = 0;
        }
        if (isNaN(remainingSeconds)) {
            remainingSeconds = 0;
        }
        return `${minutes}.${remainingSeconds}`;
    };

    api_router.get('/user', async (req, res) => {
        const user = await runQuery('select * from users where Employee_ID=?', [req.query.UserId]);
        return res.json(user[0]);
    });

    api_router.get("/ExportTimeLog/:Project_ID", async (req, res) => {
        try {
            const log = await runQuery('SELECT TM.*,T.Type,U.Full_Name as User_Name,T.Milestone_Name as Milestone,T.Project_ID as Project,M.Customer as Customer FROM timesheet as TM join task as T join users as U join milestone as M where T.TaskName=TM.TaskName and TM.UserID=U.Employee_ID and M.Milestone_Name=T.Milestone_Name and T.Project_ID=?', [req.params.Project_ID]);
            let Excel = new excel.Workbook();
            let Sheet = Excel.addWorksheet(req.params.Project_ID + "_Log");
            const Headers = [
                { header: "Customer", key: "Customer", width: 20 },
                { header: "Project", key: "Project", width: 20 },
                { header: "Milestone", key: "Milestone", width: 20 },
                { header: "Task", key: "Type", width: 20 },
                { header: "Task Name", key: "TaskName", width: 20 },
                { header: "Engineer ID", key: "UserID", width: 20 },
                { header: "Engineer Name", key: "User_Name", width: 20 },
                { header: "Start Time", key: "startTime", width: 20 },
                { header: "End Time", key: "endTime", width: 20 },
                { header: "Duration(min)", key: "duration", width: 20 },
            ]
            Sheet.columns = Headers;
            log.forEach(row => {
                row.duration = secondsToMinutes(row.duration);
                row.startTime = new Date(row.startTime).toLocaleString('en-GB');
                row.endTime = new Date(row.endTime).toLocaleString('en-GB');
                Sheet.addRow(row);
            });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=example.xlsx');
            const ExcelBuffer = await Excel.xlsx.writeBuffer();
            res.send(Buffer.from(ExcelBuffer));
        } catch (error) {
            console.log(error);
        }
    });

    api_router.post("/AddCommentTo/:Destination/:ID", RefDocUpload.single("attachment"), async (req, res, next) => {
        if (req.session.UserID) {
            let history;
            if (req.params.Destination == "Markup") {
                history = await runQuery("select * from markup where Sub_Task_Name=?", [req.params.ID]);
            } else if (req.params.Destination == "Task") {
                history = await runQuery("select * from task where TaskName=?", [req.params.ID]);
            } else if (req.params.Destination == "Subtask") {
                history = await runQuery("select * from subtask where SubTaskName=?", [req.params.ID]);
            }
            if (history.length) {
                let temp = JSON.parse(history[0].Comments);
                const len = (Object.keys(temp).length) ? Object.keys(temp).length : 0;
                let objName = `Group${len + 1}`
                temp[objName] = {
                    On: getTimeStamp(),
                    Note: req.body.Comment.replace(/\r?\n/g, '<br/>'),
                    Author_ID: req.session.UserID,
                    attachment: res.req.file ? res.req.file.filename : null,
                    Author_Name: req.session.UserName
                };
                if (req.params.Destination == "Markup") {
                    await runQuery("update markup set Comments=? where Sub_Task_Name=?", [JSON.stringify(temp), req.params.ID]);
                    return res.redirect(req.headers.referer);
                } else if (req.params.Destination == "Task") {
                    await runQuery("update task set Comments=? where TaskName=?", [JSON.stringify(temp), req.params.ID]);
                    return res.redirect(req.headers.referer);
                } else if (req.params.Destination == "Subtask") {
                    await runQuery("update subtask set Comments=? where SubTaskName=?", [JSON.stringify(temp), req.params.ID]);
                    return res.redirect(req.headers.referer);
                }
            } else {
                res.redirect('/')
            }

        } else {
            res.status(400).json({ Message: "Access Denied" })
        }
    });

    api_router.post('/UpdateOwner', async (req, res, next) => {
        if (req.session.UserID && req.session.UserRole == "PMO" || req.session.UserRole == "Manager") {
            const { Target, NewOwner, ID } = req.body;
            let NewOwnerInfo = await runQuery("select * from users where Employee_ID=?", [NewOwner]);
            try {
                const log = await runQuery("SELECT * FROM timesheet where  TaskName=? and endTime is null order by idtimesheet desc", [ID]);
                if (log.length) {
                    req.session.Notifications = JSON.stringify(new Notification('Error..!', `The Timer is Currently Running for this Task ${ID}.So It Cannot be Re-Assigned now.`, 'error', '5s'));
                } else if (Target == "Milestone") {
                    let MilestoneInfo = await runQuery("Select * from milestone where Milestone_Name=?", [ID]);
                    let CurrentOwnerInfo = await runQuery("select * from users where Employee_ID=?", [MilestoneInfo[0].Owner]);
                    await runQuery("Update milestone set Owner=? where Milestone_Name=?", [NewOwner, ID]).then(async result => {
                        //Informing the Current Owner
                        await SendEmail(CurrentOwnerInfo[0].Email_ID, "", `Reassignment of Milestone : ${MilestoneInfo[0].Project_ID}_${MilestoneInfo[0].Milestone_Name}`, `<div style="font-size:14px">
                            <p>Dear <b>${CurrentOwnerInfo[0].Full_Name}</b>,</p>
                            <p>Please be informed that the following milestone has been reassigned to <b>${NewOwnerInfo[0].Full_Name}</b>. </p>
                            <hr>
                            <p><b>Milestone Name: </b><a href='${encodeURI(getBaseURL(req) + '/ViewMilestone/' + MilestoneInfo[0].Customer + '/' + MilestoneInfo[0].idProjects + '/' + MilestoneInfo[0].Milestone_Name)}'>${MilestoneInfo[0].Milestone_Name}</a></p>
                        </div>`);
                        //Informing the New Owner
                        await SendEmail(NewOwnerInfo[0].Email_ID, "", `Reassignment of Milestone: ${MilestoneInfo[0].Project_ID}_${MilestoneInfo[0].Milestone_Name}`, `<div style="font-size:14px">
                            <p>Dear <b>${NewOwnerInfo[0].Full_Name}</b>,</p>
                            <p>This is to inform you that the following milestone has been reassigned to you.</p>
                            <hr>
                            <p><b>Milestone Name: </b><a href='${encodeURI(getBaseURL(req) + '/ViewMilestone/' + MilestoneInfo[0].Customer + '/' + MilestoneInfo[0].idProjects + '/' + MilestoneInfo[0].Milestone_Name)}'>${MilestoneInfo[0].Milestone_Name}</a> </p>
                            <p><b>Project: </b>${MilestoneInfo[0].Project_ID}</p>
                            <hr>
                            <p>Please review the requirements and take the necessary actions to ensure timely completion. If you have any questions, feel free to reach out to PMO. </p>
                        </div>`);
                    })
                    req.session.Notifications = JSON.stringify(new Notification('Success..!', `Milestone Owner Updated Successfully.`, 'success', '3s'));
                } else if (Target == "Task") {
                    let TaskInfo = await runQuery("SELECT task.*,milestone.Customer FROM task inner join milestone on milestone.Milestone_Name=task.Milestone_Name where task.TaskName=?", [ID]);
                    let CurrentOwnerInfo = await runQuery("select * from users where Employee_ID=?", [TaskInfo[0].Owner]);
                    await runQuery("Update task set Owner=? where TaskName=?", [NewOwner, ID]).then(async result => {
                        //Informing the Current Owner
                        await SendEmail(CurrentOwnerInfo[0].Email_ID, "", `Task Reassignment: ${TaskInfo[0].Milestone_Name}_${TaskInfo[0].TaskName}`, `<div style="font-size:14px">
                            <p>Dear <b>${CurrentOwnerInfo[0].Full_Name}</b>,</p>
                            <p>This is to inform you that the following task has been reassigned to ${NewOwnerInfo[0].Full_Name}.</P>
                            <hr>
                            <p><b>Task Name: </b><a href='${encodeURI(getBaseURL(req) + '/ViewTask/' + TaskInfo[0].Customer + '/' + TaskInfo[0].Milestone_Name + '/' + TaskInfo[0].TaskName)}'>${TaskInfo[0].TaskName}</a></p>
                            <p><b>Milestone Name: </b>${TaskInfo[0].Milestone_Name}</p>
                        </div>`);
                        //Informing the New Owner
                        await SendEmail(NewOwnerInfo[0].Email_ID, "", `Task Reassignment: ${TaskInfo[0].Milestone_Name}_${TaskInfo[0].TaskName}`, `<div style="font-size:14px">
                            <p>Dear <b>${NewOwnerInfo[0].Full_Name}</b>,</p>
                            <p>This is to inform you that the following task has been reassigned to you.</p>
                            <hr>
                            <p><b>Task Name: </b><a href='${encodeURI(getBaseURL(req) + '/ViewTask/' + TaskInfo[0].Customer + '/' + TaskInfo[0].Milestone_Name + '/' + TaskInfo[0].TaskName)}'>${TaskInfo[0].TaskName}</a> </p>
                            <p><b>Milestone Name: </b>${TaskInfo[0].Milestone_Name}</p>
                        </div>`);

                    });
                    req.session.Notifications = JSON.stringify(new Notification('Success..!', `Task Owner Updated Successfully.`, 'success', '3s'));
                } else if (Target == "Markup") {
                    let MarkupInfo = await runQuery("SELECT markup.*,milestone.Customer FROM markup inner join milestone on milestone.Milestone_Name=markup.Milestone_Name where markup.Sub_Task_Name=?", [ID]);
                    let CurrentOwnerInfo = await runQuery("select * from users where Employee_ID=?", [MarkupInfo[0].Owner]);
                    await runQuery("Update markup set Owner=? where Sub_Task_Name=?", [NewOwner, ID]).then(async result => {
                        //Informing the Current Owner
                        await SendEmail(CurrentOwnerInfo[0].Email_ID, "", `Markup Task Reassignment: ${MarkupInfo[0].Milestone_Name}_${MarkupInfo[0].Sub_Task_Name}`, `<div style="font-size:14px">
                            <p>Dear <b>${CurrentOwnerInfo[0].Full_Name}</b>,</p>
                            <p>This is to inform you that the following markup task has been reassigned to ${NewOwnerInfo[0].Full_Name}.<p>
                            <hr>
                            <p><b>Markup Task: </b><a href='${encodeURI(getBaseURL(req) + '/Markup/' + MarkupInfo[0].Sub_Task_Name)}'>${MarkupInfo[0].Sub_Task_Name}</a></p>
                            <p><b>${MarkupInfo[0].MarkupFor == "Task" ? "Task Name :" : "Subtask Name :"} </b>${MarkupInfo[0].Sub_Task_Name}</p>
                        </div>`);
                        //Informing the New Owner
                        await SendEmail(NewOwnerInfo[0].Email_ID, "", `Markup Task Reassignment: ${MarkupInfo[0].Milestone_Name}_${MarkupInfo[0].Task_Name}_${MarkupInfo[0].Sub_Task_Name}`, `<div style="font-size:14px">
                            <p>Dear <b>${NewOwnerInfo[0].Full_Name}</b>,</p>
                            <p>This is to inform you that the following markup task has been reassigned to you.</p>
                            <hr>
                            <p><b>Markup Task: </b><a href='${encodeURI(getBaseURL(req) + '/Markup/' + MarkupInfo[0].Sub_Task_Name)}'>${MarkupInfo[0].Sub_Task_Name}</a> </p>
                            <p><b>${MarkupInfo[0].MarkupFor == "Task" ? "Task Name: " : "Subtask Name: "}</b>${MarkupInfo[0].Sub_Task_Name}</p>
                        </div>`);
                    });
                    req.session.Notifications = JSON.stringify(new Notification('Success..!', `Markup Owner Updated Successfully.`, 'success', '3s'));
                } else if (Target == "SubTask") {
                    let SubtaskInfo = await runQuery("Select * from subtask where SubTaskName=?", [ID]);
                    let CurrentOwnerInfo = await runQuery("select * from users where Employee_ID=?", [SubtaskInfo[0].Owner]);
                    await runQuery("Update subtask set Owner=? where SubTaskName=?", [NewOwner, ID]).then(async result => {
                        //Informing the Current Owner
                        await SendEmail(CurrentOwnerInfo[0].Email_ID, "", `Subtask Reassignment: ${SubtaskInfo[0].Task_Name}_${SubtaskInfo[0].SubTaskName}`, `<div style="font-size:14px">
                            <p>Dear <b>${CurrentOwnerInfo[0].Full_Name}</b>,</p>
                            <p>This is to inform you that the following subtask has been reassigned to ${NewOwnerInfo[0].Full_Name}.<p>
                            <hr>
                            <p><b>Subtask Name: </b><a href='${encodeURI(getBaseURL(req) + '/SubTask/' + SubtaskInfo[0].SubTaskName)}'>${SubtaskInfo[0].SubTaskName}</a></p>
                            <p><b>Task Name: </b>${SubtaskInfo[0].Task_Name}</p>
                        </div>`);
                        //Informing the New Owner
                        await SendEmail(NewOwnerInfo[0].Email_ID, "", `Subtask Reassignment: ${SubtaskInfo[0].Task_Name}_${SubtaskInfo[0].SubTaskName}`, `<div style="font-size:14px">
                            <p>Dear <b>${NewOwnerInfo[0].Full_Name}</b>,</p>
                            <p>This is to inform you that the following subtask has been reassigned to you.</p>
                            <hr>
                            <p><b>Subtask Name: </b><a href='${encodeURI(getBaseURL(req) + '/SubTask/' + SubtaskInfo[0].Sub_Task_Name)}'>${SubtaskInfo[0].SubTaskName}</a> </p>
                            <p><b>Task Name: </b>${SubtaskInfo[0].Task_Name}</p>
                        </div>`);
                    })
                    req.session.Notifications = JSON.stringify(new Notification('Success..!', `Subtask Owner Updated Successfully.`, 'success', '3s'));
                }
                return res.status(200).send("ok");
            } catch (error) {
                console.log(error);
                req.session.Notifications = JSON.stringify(new Notification('Error..!', `Something Went Wrong.`, 'Error', '2s'));
                return res.status(400).send("Not ok");
            }
        } else {
            res.status(400).json({ Message: "Access Denied" })
        }
    });

    api_router.get("/SearchData", async (req, res, next) => {
        if (req.session.UserID) {
            const { searchTerm } = req.query;
            let result = [];
            try {
                for (const v of Object.keys(projectTableNames)) {
                    const data = await runQuery(`select * from ${projectTableNames[v].Table} where ${projectTableNames[v].ProjectColumn} like ?`, ['%' + searchTerm + '%']);
                    if (data.length > 0) {
                        data.forEach(record => {
                            result.push(JSON.stringify({
                                Project: {
                                    idProjects: record.idProjects,
                                    Customer: v,
                                    ProjectID: record[projectTableNames[v].ProjectColumn],
                                    Owner: record.Owner,
                                    Status: record.Status
                                }
                            }))
                        })
                    }
                };
                const data = await runQuery("Select * from milestone where Milestone_Name like ?", ['%' + searchTerm + '%']);
                if (data.length > 0) {
                    data.forEach(record => {
                        result.push(JSON.stringify({
                            Milestone: {
                                Customer: record.Customer,
                                idProjects: record.idProjects,
                                Milestone_Name: record.Milestone_Name,
                                Status: record.Milestone_Status
                            }
                        }))
                    });
                }
                const TaskData = await runQuery("SELECT m.Customer,T.* FROM task as T inner join milestone as m on m.Milestone_Name=T.Milestone_Name and T.idProjects=m.idProjects and T.Project_ID=m.Project_ID where T.TaskName like ?", ['%' + searchTerm + '%']);
                if (TaskData.length > 0) {
                    TaskData.forEach(record => {
                        result.push(JSON.stringify({
                            Task: {
                                Customer: record.Customer,
                                TaskName: record.TaskName,
                                Milestone_Name: record.Milestone_Name,
                                Status: record.Status
                            }
                        }));
                    });
                }
                const SubTaskData = await runQuery("SELECT m.Customer,T.* FROM subtask as T inner join milestone as m on m.Milestone_Name=T.Milestone_Name and T.idProjects=m.idProjects and T.Project_ID=m.Project_ID where T.SubTaskName like ?", ['%' + searchTerm + '%']);
                if (SubTaskData.length > 0) {
                    SubTaskData.forEach(record => {
                        result.push(JSON.stringify({
                            SubTask: {
                                Customer: record.Customer,
                                SubTaskName: record.SubTaskName,
                                Milestone_Name: record.Milestone_Name,
                                Status: record.Status
                            }
                        }));
                    });
                }
                const MarkupData = await runQuery("SELECT m.Customer,T.* FROM markup as T inner join milestone as m on m.Milestone_Name=T.Milestone_Name and T.idProjects=m.idProjects and T.Project_ID=m.Project_ID where T.Sub_Task_Name like ?", ['%' + searchTerm + '%']);
                if (MarkupData.length > 0) {
                    MarkupData.forEach(record => {
                        result.push(JSON.stringify({
                            Markup: {
                                Customer: record.Customer,
                                Sub_Task_Name: record.Sub_Task_Name,
                                Milestone_Name: record.Milestone_Name,
                                Status: record.Status
                            }
                        }));
                    });
                }
                return res.status(200).json({ result: result });
            } catch (error) {
                console.log(error);
                return res.status(500).json({ Message: "Something Went Wrong." })
            }
        } else {
            return res.status(400).json({ Message: "Access Denied" })
        }
    });

    api_router.get("/getProjectReport/:Customer", async (req, res, next) => {
        if (req.session.UserID) {
            try {
                const Status = await runQuery(`select Status,count(*) as Count from ${projectTableNames[req.params.Customer].Table} group by Status;`);
                const SOW = await runQuery(`select SOW,count(*) as Count from ${projectTableNames[req.params.Customer].Table} group by SOW;`);
                const ReceivedInfo = await runQuery(`select Year(ReceivedDate) as Year, monthname(ReceivedDate) as month, count(*) as Count from ${projectTableNames[req.params.Customer].Table} group by YEAR(ReceivedDate),monthname(ReceivedDate) ORDER BY year ASC;`)
                const SubmittedInfo = await runQuery(`select Year(SubmittedDate) as Year, monthname(SubmittedDate) as month, count(*) as Count from ${projectTableNames[req.params.Customer].Table} group by YEAR(SubmittedDate),monthname(SubmittedDate) ORDER BY year ASC;`)
                const ApprovedInfo = await runQuery(`select Year(ApprovedDate) as Year, monthname(ApprovedDate) as month, count(*) as Count from ${projectTableNames[req.params.Customer].Table} group by YEAR(ApprovedDate),monthname(ApprovedDate) ORDER BY year ASC;`)
                res.json({ data: { Status, ReceivedInfo, SOW, SubmittedInfo, ApprovedInfo } })
            } catch (error) {
                console.log(error)
                res.status(500)
            }
        } else {
            return res.status(400).json({ Message: "Access Denied" });
        }
    });

    api_router.post("/UpdateDueDate", async (req, res, next) => {
        if (req.session.UserID) {
            const data = req.body;
            let field = data.field;
            let input = {
                Updated_By: req.session.UserID,
                Updated_Date: getTimeStamp(),
            };
            input[field] = data.newDate ? data.newDate : null;
            switch (data.Target) {
                case "Milestone":
                    runQuery("Update milestone set ? where idmilestone=?", [input, data.ID]).then(result => {
                        req.session.Notifications = JSON.stringify(new Notification('Success..!', "Milestone Updated Successfully.", 'success', '2s'));
                        return res.status(200).send("ok");
                    }).catch(er => {
                        console.log(er)
                        req.session.Notifications = JSON.stringify(new Notification('Error..!', "Unable to update the milestone...!", 'error', '3s'));
                        return res.status(400).send(er);
                    })
                    break;
                case "Task":
                    runQuery("Update task set ? where idTask=?", [input, data.ID]).then(async result => {
                        req.session.Notifications = JSON.stringify(new Notification('Success..!', "Task Updated Successfully.", 'success', '2s'));
                        if (field == "QC_Name") {
                            await runQuery("Update subtask set QC_Name=? where idTask=? and Status in ('YTS','WIP')", [data.newDate, data.ID]).then(() => {
                                return res.status(200).send("ok");
                            }).catch(er => {
                                return res.status(400).send(er);
                            })
                        } else {
                            return res.status(200).send("ok");
                        }
                    }).catch(er => {
                        req.session.Notifications = JSON.stringify(new Notification('Error..!', "Unable to update the task...!", 'error', '3s'));
                        return res.status(400).send(er);
                    })
                    break;
                case "Subtask":
                    runQuery("Update subtask set ? where idSubTask=?", [input, data.ID]).then(result => {
                        req.session.Notifications = JSON.stringify(new Notification('Success..!', "Subtask Updated Successfully.", 'success', '2s'));
                        return res.status(200).send("ok");
                    }).catch(er => {
                        req.session.Notifications = JSON.stringify(new Notification('Error..!', "Unable to update the subtask...!", 'error', '3s'));
                        return res.status(400).send(er);
                    })
                    break;
                case "Markup":
                    runQuery("Update markup set ? where idsubtask=?", [input, data.ID]).then(result => {
                        req.session.Notifications = JSON.stringify(new Notification('Success..!', "Markup Updated Successfully.", 'success', '2s'));
                        return res.status(200).send("ok");
                    }).catch(er => {
                        req.session.Notifications = JSON.stringify(new Notification('Error..!', "Unable to update the markup...!", 'error', '3s'));
                        return res.status(400).send(er);
                    })
                    break;
                default:
                    break;
            }
        } else {
            return res.status(400).json({ Message: "Access Denied" })
        }
    });

    io.on("getAllActiveStatus", (data) => {
        console.log(data);
    });

    api_router.post("/DocumentCenter", UploadAttachments.single('file'), async (req, res) => {
        const data = req.session.attachmentsInput;
        const uploadDir = await determineUploadDir(data);
        const files = req.file;
        try {
            const filePath = path.join(uploadDir, files.originalname);
            const tempPath = files.path;
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            if (fs.existsSync(filePath)) {
                fs.unlink(tempPath, (err) => {
                    if (err) {
                        return res.status(500).json({ message: 'Error deleting temporary file', error: err });
                    }
                    return res.status(409).json({ message: 'File already exists', path: filePath });
                })
            } else {
                fs.copyFile(tempPath, filePath, (err) => {
                    if (err) {
                        console.log(err)
                        return res.status(500).json({ message: "Error saving file", error: err });
                    } else {
                        fs.rm(tempPath, (err) => {
                            if (err) {
                                console.log(err)
                                return res.status(500).json({ message: 'Error deleting temporary file', error: err });
                            } else {
                                const successValues = [
                                    data.Customer,
                                    data.Project_ID,
                                    data.Milestone ? data.Milestone : null,
                                    data.TaskID ? data.TaskID : null,
                                    data.Task ? data.Task : null,
                                    data.ParentTask ? data.ParentTask : null,
                                    data.Category,
                                    files.originalname,
                                    (files.size / (1024 * 1024)).toFixed(2),
                                    path.extname(files.originalname),
                                    req.session.UserID,
                                    filePath,
                                    getTimeStamp()
                                ];
                                runQuery("insert into attachments (Customer, Project, Milestone,TaskID ,Task, ParentTask,Category, Name, Size, Type, Owner,path, Created_Date) values (?)", [successValues]).then(result => {
                                    res.status(200).json({ message: 'Files uploaded successfully' });
                                }).catch(er => {
                                    console.log(er)
                                    return res.status(500).json({ message: 'Data Base  Error' });
                                });
                            }
                        });
                    }
                });
            }
        } catch (error) {
            console.log(error)
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    });

    //Endpoint to download single document
    api_router.get("/DocumentCenter/:ID", async (req, res) => {
        const fileID = req.params.ID;
        let result = await runQuery("select * from attachments where idattachments=?", [fileID]);
        if (result.length === 0) {
            return res.status(404).json({ message: 'File not found' });
        } else {
            const file = result[0];
            res.download(file.path, file.name, (err) => {
                if (err) {
                    console.error(err);
                    res.status(500).json({ message: 'File download error', error: err.message });
                }
            });
        }
    });
    // Endpoint to download multiple files by their IDs
    api_router.post('/DocumentCenter/download', async (req, res) => {
        const fileIds = req.body.params.FileID; // Assume the client sends an array of file IDs in the request body
        if (!Array.isArray(fileIds) || fileIds.length === 0) {
            return res.status(400).json({ message: 'No file IDs provided' });
        }
        const results = await runQuery("SELECT * FROM attachments WHERE idattachments IN (?)", [fileIds])
        if (results.length === 0) {
            return res.status(404).json({ message: 'Files not found' });
        }

        const archive = archiver('zip', {
            zlib: { level: 9 } // Set the compression level
        });

        res.attachment('files.zip');

        archive.on('error', (err) => {
            console.error(err);
            res.status(500).json({ message: 'File compression error', error: err.message });
        });

        archive.pipe(res);

        results.forEach(file => {
            archive.file(file.path, { name: file.Name });
        });

        await archive.finalize();
    });

    //Endpoint to delete attachments
    api_router.delete("/DocumentCenter/Delete", async (req, res) => {
        const { FileID } = req.body;
        const record = await runQuery("select * from attachments where idattachments=? and Status='Active'", [FileID]);
        if (record.length) {
            const fileDir = path.dirname(record[0].path)
            const archiveDirectory = path.join(fileDir, 'Archive');
            const fileName = path.basename(record[0].path);
            const newFilePath = path.join(archiveDirectory, fileName)
            if (!fs.existsSync(archiveDirectory)) {
                fs.mkdirSync(archiveDirectory, { recursive: true });
            }
            fs.rename(record[0].path, newFilePath, (err) => {
                if (err) {
                    console.log(err)
                    return res.status(400).send(new Notification('Error', 'Unable to remove file try again', 'error', '5s'))
                } else {
                    runQuery("update attachments set Status='Inactive',path=? where idattachments=?", [newFilePath, FileID]).then(result => {
                        req.session.Notifications = JSON.stringify(new Notification('Success', 'File removed successfully', 'success', '3s'))
                        return res.status(200).send(new Notification('Success', 'File removed successfully', 'success', '3s'))
                    }).catch(error => {
                        console.log(error)
                        return res.status(400).send(new Notification('Error', 'Internal Server Error', 'error', '5s'))
                    })
                }
            })
        } else {
            return res.status(400).json({ Message: "Record Not Found" })
        }
    })

    //Export Milestone Info as Excel File.
    api_router.get("/downloadMilestones", async (req, res) => {
        const { Project_ID, Milestone_Status } = req.params;
        try {
            const conditions = [];
            if (req.session.UserRole == "PMO") {
                conditions.push(`Created_By='${req.session.UserID}'`)
            }
            if (req.session.UserRole == "Manager") {
                conditions.push(`Owner='${req.session.UserID}'`)
            }
            for (const key in req.query) {
                const value = req.query[key];
                if (value !== "" && value !== undefined) {
                    if (key == "Project_ID") {
                        conditions.push(`${key} REGEXP '${value}'`);
                    } else {
                        conditions.push(`${key} = '${value}'`);
                    }
                }
            }
            const whereClause = conditions.length > 0 ? "where " + conditions.join(" AND ") : "";
            const milestones = await runQuery(`select milestone.*,DATE_FORMAT(Due_Date,'%Y-%m-%d') as f_Due_Date,DATE_FORMAT(QC_TGT_End_Date,'%Y-%m-%d') as f_QC_TGT_End_Date,DATE_FORMAT(QC_ACT_End_Date,'%Y-%m-%d') as f_QC_ACT_End_Date,
        DATE_FORMAT(Prod_TGT_Start_Date,'%c/%d/%y') as Prod_TGT_Start_Date, DATE_FORMAT(Prod_TGT_End_Date,'%c/%d/%y') as Prod_TGT_End_Date,
        COALESCE(DATE_FORMAT(Prod_ACT_Start_Date,'%c/%d/%y'),'-') as Prod_ACT_Start_Date,COALESCE(DATE_FORMAT(Prod_ACT_End_Date,'%c/%d/%y'),'-') as Prod_ACT_End_Date,
        DATE_FORMAT(QC_TGT_Start_Date,'%c/%d/%y') as QC_TGT_Start_Date,DATE_FORMAT(QC_TGT_End_Date,'%c/%d/%y') as QC_TGT_End_Date,
        COALESCE(DATE_FORMAT(QC_ACT_Start_Date,'%c/%d/%y'),'-') as QC_ACT_Start_Date,COALESCE(DATE_FORMAT(QC_ACT_End_Date,'%c/%d/%y'),'-') as QC_ACT_End_Date,
        COALESCE(DATE_FORMAT(Approved_Date,'%c/%d/%y'),'-') as Approved_Date,COALESCE(DATE_FORMAT(Submitted_Date,'%c/%d/%y'),'-') as Submitted_Date,
        DATE_FORMAT(Due_Date,'%c/%d/%y') as Due_Date,DATE_FORMAT(Created_Date,'%c/%d/%y') as Created_Date,U.Full_Name as Owner_Name,UU.Full_Name as Creator_Name from milestone inner join users as U on U.Employee_ID=milestone.Owner inner join users as UU on UU.Employee_ID=milestone.Created_By
        ${whereClause} order by idmilestone desc`);
            let workbook = new excel.Workbook();
            let worksheet = workbook.addWorksheet(Project_ID);
            const Headers = [
                { header: "Project ID", key: "Project_ID", width: 10 },
                { header: "Milestone", key: "Milestone_Name", width: 10 },
                { header: "Prod TGT Start Date", key: "Prod_TGT_Start_Date", width: 10 },
                { header: "Prod ACT Start Date", key: "Prod_ACT_Start_Date", width: 10 },
                { header: "Prod TGT End Date", key: "Prod_TGT_End_Date", width: 10 },
                { header: "Prod ACT End Date", key: "Prod_ACT_End_Date", width: 10 },
                { header: "QC TGT Start Date", key: "QC_TGT_Start_Date", width: 10 },
                { header: "QC ACT Start Date", key: "QC_ACT_Start_Date", width: 10 },
                { header: "QC TGT End Date", key: "QC_TGT_End_Date", width: 10 },
                { header: "QC ACT End Date", key: "QC_ACT_End_Date", width: 10 },
                { header: "Created By", key: "Creator_Name", width: 10 },
                { header: "Create Date", key: "Created_Date", width: 10 },
                { header: "Owner", key: "Owner_Name", width: 10 },
                { header: "Status", key: "Milestone_Status", width: 10 },
                { header: "Submitted Date", key: "Submitted_Date", width: 10 },
                { header: "Approved Date", key: "Approved_Date", width: 10 },
            ]
            worksheet.columns = Headers;
            milestones.forEach(row => {
                worksheet.addRow(row);
            })
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=QGPMS-Milestone-List-${getTimeStamp()}.xlsx`);
            await workbook.xlsx.write(res)
        } catch (error) {
            console.log(error)
        }
    });
    //Export Task Info as Excel File.
    api_router.get("/downloadTask", async (req, res) => {
        const { Project_ID, Status, TaskName, Milestone_Name } = req.params;
        try {
            const conditions = [];
            if (req.session.UserRole == "PMO") {
                conditions.push(`Created_By='${req.session.UserID}'`)
            }
            if (req.session.UserRole == "Manager") {
                conditions.push(`Owner='${req.session.UserID}'`)
            }
            for (const key in req.query) {
                const value = req.query[key];
                if (value !== "" && value !== undefined) {
                    if (key == "Project_ID" || key == "Milestone_Name" || key == "Status") {
                        conditions.push(`T.${key} REGEXP '${value}$'`);
                    } else {
                        conditions.push(`${key} = '${value}'`);
                    }
                }
            }
            const whereClause = conditions.length > 0 ? "where " + conditions.join(" AND ") : "";
            const data = await runQuery(`select T.*,date_format(T.StartDate,'%c/%d/%y') as StartDate,date_format(T.DueDate,'%c/%d/%y') as DueDate, date_format(T.EndDate,'%c/%d/%y') as EndDate,m.Customer,U.Full_Name as Owner_Name,UU.Full_Name as Creator_Name from task  as T inner join milestone as m on m.Milestone_Name=T.Milestone_Name inner join users U on U.Employee_ID=T.Owner inner join users UU on UU.Employee_ID=T.Created_By ${whereClause}`);
            let workbook = new excel.Workbook();
            let worksheet = workbook.addWorksheet(Project_ID);
            const Headers = [
                { header: "Project ID", key: "Project_ID", width: 10 },
                { header: "Milestone ID", key: "Milestone_Name", width: 10 },
                { header: "Task ID", key: "TaskName", width: 10 },
                { header: "Task Name", key: "TaskLabel", width: 10 },
                { header: "Create Date", key: "Created_Date", width: 10 },
                { header: "Created By", key: "Creator_Name", width: 10 },
                { header: "Owner", key: "Owner_Name", width: 10 },
                { header: "Due Date", key: "DueDate", width: 10 },
                { header: "Star tDate", key: "StartDate", width: 10 },
                { header: "End Date", key: "EndDate", width: 10 },
                { header: "Status", key: "Status", width: 10 },
            ];
            worksheet.columns = Headers;
            data.forEach(row => {
                worksheet.addRow(row);
            });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=QGPMS-Task-List-${getTimeStamp()}.xlsx`);
            await workbook.xlsx.write(res)
        } catch (error) {
            console.log(error)
        }
    });
    //Export Sub Task Info as Excel File.
    api_router.get("/downloadSubTask", async (req, res) => {
        const { Project_ID, Status, TaskName, Milestone_Name } = req.params;
        try {
            const conditions = [];
            if (req.session.UserRole == "PMO") {
                conditions.push(`Created_By='${req.session.UserID}'`)
            }
            if (req.session.UserRole == "Manager") {
                conditions.push(`Owner='${req.session.UserID}'`)
            }
            for (const key in req.query) {
                const value = req.query[key];
                if (value !== "" && value !== undefined) {
                    if (key == "Project_ID" || key == "Milestone_Name" || key == "Status") {
                        conditions.push(`T.${key} REGEXP '${value}$'`);
                    } else {
                        conditions.push(`${key} = '${value}'`);
                    }
                }
            }
            const whereClause = conditions.length > 0 ? "where " + conditions.join(" AND ") : "";
            const data = await runQuery(`select T.*,date_format(T.Created_Date,'%c/%d/%y') as Created_Date,date_format(T.StartDate,'%c/%d/%y') as StartDate,date_format(T.Due_Date,'%c/%d/%y') as DueDate, date_format(T.EndDate,'%c/%d/%y') as EndDate,m.Customer,U.Full_Name as Owner_Name,UU.Full_Name as Creator_Name from subtask  as T inner join milestone as m on m.Milestone_Name=T.Milestone_Name inner join users U on U.Employee_ID=T.Owner inner join users UU on UU.Employee_ID=T.Created_By ${whereClause}`);
            let workbook = new excel.Workbook();
            let worksheet = workbook.addWorksheet(Project_ID);
            const Headers = [
                { header: "Project ID", key: "Project_ID", width: 10 },
                { header: "Milestone ID", key: "Milestone_Name", width: 10 },
                { header: "Parent Task ID", key: "Task_Name", width: 10 },
                { header: "Sub Task ID", key: "SubTaskName", width: 10 },
                { header: "Sub Task Name", key: "SubTaskLabel", width: 10 },
                { header: "Type", key: "Type", width: 10 },
                { header: "Create Date", key: "Created_Date", width: 10 },
                { header: "Created By", key: "Creator_Name", width: 10 },
                { header: "Owner", key: "Owner_Name", width: 10 },
                { header: "Due Date", key: "DueDate", width: 10 },
                { header: "Star tDate", key: "StartDate", width: 10 },
                { header: "End Date", key: "EndDate", width: 10 },
                { header: "Status", key: "Status", width: 10 },
            ];
            worksheet.columns = Headers;
            data.forEach(row => {
                worksheet.addRow(row);
            });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=QGPMS-Subtask-List-${getTimeStamp()}.xlsx`);
            await workbook.xlsx.write(res)
        } catch (error) {
            console.log(error)
        }
    });
    //Export Markup Info as Excel File.
    api_router.get("/downloadMarkupTask", async (req, res) => {
        const { Project_ID, Status, TaskName, Milestone_Name } = req.params;
        try {
            const conditions = [];
            if (req.session.UserRole == "PMO") {
                conditions.push(`Created_By='${req.session.UserID}'`)
            }
            if (req.session.UserRole == "Manager") {
                conditions.push(`Owner='${req.session.UserID}'`)
            }
            for (const key in req.query) {
                const value = req.query[key];
                if (value !== "" && value !== undefined) {
                    if (key == "Project_ID" || key == "Milestone_Name" || key == "Status") {
                        conditions.push(`T.${key} REGEXP '${value}$'`);
                    } else {
                        conditions.push(`${key} = '${value}'`);
                    }
                }
            }
            const whereClause = conditions.length > 0 ? "where " + conditions.join(" AND ") : "";
            const data = await runQuery(`select T.*,date_format(T.Created_Date,'%c/%d/%y') as Created_Date,date_format(T.StartDate,'%c/%d/%y') as StartDate,date_format(T.DueDate,'%c/%d/%y') as DueDate, date_format(T.EndDate,'%c/%d/%y') as EndDate,m.Customer,U.Full_Name as Owner_Name,UU.Full_Name as Creator_Name from markup  as T inner join milestone as m on m.Milestone_Name=T.Milestone_Name inner join users U on U.Employee_ID=T.Owner inner join users UU on UU.Employee_ID=T.CreatedBy ${whereClause}`);
            let workbook = new excel.Workbook();
            let worksheet = workbook.addWorksheet(Project_ID);
            const Headers = [
                { header: "Project ID", key: "Project_ID", width: 10 },
                { header: "Milestone ID", key: "Milestone_Name", width: 10 },
                { header: "Task ID", key: "Task_Name", width: 10 },
                { header: "Markup ID", key: "Sub_Task_Name", width: 10 },
                { header: "Create Date", key: "Created_Date", width: 10 },
                { header: "Created By", key: "Creator_Name", width: 10 },
                { header: "Owner", key: "Owner_Name", width: 10 },
                { header: "Due Date", key: "DueDate", width: 10 },
                { header: "Star tDate", key: "StartDate", width: 10 },
                { header: "End Date", key: "EndDate", width: 10 },
                { header: "Status", key: "Status", width: 10 },
            ];
            worksheet.columns = Headers;
            data.forEach(row => {
                worksheet.addRow(row);
            });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=QGPMS-Subtask-List-${getTimeStamp()}.xlsx`);
            await workbook.xlsx.write(res)
        } catch (error) {
            console.log(error)
        }
    });
    //Export Time Sheet Info as Excel File.
    api_router.get("/downloadTimeSheets", async (req, res) => {
        const { Project_ID, Status, TaskName, Milestone_Name } = req.params;
        try {
            const { start_date, end_date, min_duration, max_duration, Full_Name, Milestone_Name, TaskName, Project_ID } = req.query;
            let query = "SELECT u.Full_Name,coalesce(t.Project_ID,s.Project_ID,m.Project_ID) as Project_ID,coalesce(t.Milestone_Name,s.Milestone_Name,m.Milestone_Name) as Milestone_Name,tm.*,tm.duration/3600 as duration,DATE_FORMAT(tm.startTime,'%Y-%m-%d / %T') as startTime,DATE_FORMAT(tm.endTime,'%Y-%m-%d  /%T') as endTime FROM timesheet as tm left join task as t on tm.TaskName=t.TaskName left join users as u on u.Employee_ID=tm.UserID left join subtask as s on tm.TaskName=s.SubTaskName left join markup as m on m.Sub_Task_Name=tm.TaskName where 1=1";
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
            query += " order by  tm.duration desc";
            const data = await runQuery(query, params).catch(er => {
                console.log(er)
            });
            let workbook = new excel.Workbook();
            let worksheet = workbook.addWorksheet("Time-Sheet");
            const Headers = [
                { header: "User", key: "Full_Name", width: 10 },
                { header: "Project ID", key: "Project_ID", width: 10 },
                { header: "Milestone ID", key: "Milestone_Name", width: 10 },
                { header: "Task ID", key: "TaskName", width: 10 },
                { header: "Star tDate", key: "startTime", width: 10 },
                { header: "End Date", key: "endTime", width: 10 },
                { header: "Duration (Hours)", key: "duration", width: 10 },
            ];
            worksheet.columns = Headers;
            data.forEach(row => {
                worksheet.addRow(row);
            });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=QGPMS-TimeSheet-Report-${getTimeStamp()}.xlsx`);
            await workbook.xlsx.write(res)
        } catch (error) {
            console.log(error)
        }
    });
    api_router.get("/downloadAttachmentReport", async (req, res) => {
        const { start_date, end_date } = req.query;
        const query = `( SELECT 
                milestone.Customer AS Customer,
                task.Project_ID as Project,
                task.Milestone_Name as Milestone_Name,
                task.TaskName AS TaskName,
                date_format(task.StartDate,'%c/%d/%y') as StartDate,
                date_format(task.EndDate,'%c/%d/%y') as EndDate,
                users.Full_Name as Owner,
                'Task' AS Category 
            FROM task
            LEFT JOIN attachments ON attachments.TaskID = task.TaskName 
            LEFT JOIN milestone ON milestone.Milestone_Name = task.Milestone_Name 
            LEFT JOIN users ON users.Employee_ID = task.Owner
            WHERE (DATE(task.EndDate) BETWEEN ? AND ? )
            AND attachments.TaskID IS NULL ) UNION ( SELECT  milestone.Customer AS Customer,
                subtask.Project_ID as Project,
                subtask.Milestone_Name as Milestone_Name,
                subtask.SubTaskName AS TaskName,
                date_format(subtask.StartDate,'%c/%d/%y') as StartDate,
                date_format(subtask.EndDate,'%c/%d/%y') as EndDate,
                users.Full_Name as Owner,
                'SubTask' AS Category
            FROM subtask
            LEFT JOIN attachments ON attachments.TaskID = subtask.SubTaskName 
            LEFT JOIN milestone ON milestone.Milestone_Name = subtask.Milestone_Name 
            LEFT JOIN users ON users.Employee_ID = subtask.Owner
            WHERE (DATE(subtask.EndDate) BETWEEN ? AND ? )
            AND attachments.TaskID IS NULL ) UNION ( SELECT 
                milestone.Customer AS Customer,
                markup.Project_ID as Project,
                markup.Milestone_Name as Milestone_Name,
                markup.Sub_Task_Name AS TaskName, 
                date_format(markup.StartDate,'%c/%d/%y') as StartDate,
                date_format(markup.EndDate,'%c/%d/%y') as EndDate,
                users.Full_Name as Owner,
                'Markup' AS Category
            FROM markup
            LEFT JOIN attachments ON attachments.TaskID = markup.Sub_Task_Name 
            LEFT JOIN milestone ON milestone.Milestone_Name = markup.Milestone_Name 
            LEFT JOIN users ON users.Employee_ID = markup.Owner
            WHERE (DATE(markup.EndDate) BETWEEN ? AND ? )
            AND attachments.TaskID IS NULL ) `;
        const startDate = start_date || '0000-01-01';
        const endDate = end_date || '9999-12-31';
        // Execute the query using placeholders to securely inject parameters
        try {
            const logData = await runQuery(query, [startDate, endDate, startDate, endDate, startDate, endDate]);
            let workbook = new excel.Workbook();
            let worksheet = workbook.addWorksheet("Task without attachments");
            const Headers = [
                { header: "Project ID", key: "Project", width: 10 },
                { header: "Milestone ID", key: "Milestone_Name", width: 10 },
                { header: "Task ID", key: "TaskName", width: 10 },
                { header: "Task Type", key: "Category", width: 10 },
                { header: "Star tDate", key: "StartDate", width: 10 },
                { header: "End Date", key: "EndDate", width: 10 },
                { header: "Attachment Count", key: "AttachmentCount", width: 5 },
                { header: "Owner", key: "Owner", width: 10 },
            ];
            worksheet.columns = Headers;
            logData.forEach(row => {
                worksheet.addRow(row);
            });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=QGPMS-Attachment-Report-${getTimeStamp()}.xlsx`);
            await workbook.xlsx.write(res)
        } catch (error) {
            console.log(error)
        }
    })
    api_router.post("/UploadRateCard", ServerBuffer.single("RateCard"), async (req, res, next) => {
        if (req.session.UserID && req.session.UserRole == "PMO" && req.session.Designation == "Head-OSP Design") {
            try {
                const workbook = xlsx.read(req.file.buffer);
                const sheetName = workbook.SheetNames[0]; // Assuming there's only one sheet
                const sheet = workbook.Sheets[sheetName];
                const data = xlsx.utils.sheet_to_json(sheet, { raw: false, cellDates: true });
                const insertionPromises = [];
                let Notifications = [];
                data.forEach(row => {
                    row.Created_Date = getTimeStamp();
                    row.Created_By = req.session.UserID;
                    // const insertionPromise = new Promise((resolve, reject) => {
                    //     db.query('insert into ratecard set ?', [row], (error, result) => {
                    //         if (error) {
                    //             console.log(error)
                    //             reject(error)
                    //         } else {
                    //             resolve(result);
                    //         }
                    //     });
                    // });
                    const insertionPromise = runQuery("insert into ratecard set ?", [row]);
                    insertionPromises.push(insertionPromise);
                });
                Promise.all(insertionPromises).then(() => {
                    Notifications.push(new Notification("Success..!", 'Rate Card Imported Successfully', 'success', '2s'));
                    res.status(200).send(Notifications);

                }).catch((e) => {
                    console.log(e)
                    next(e)
                    return res.status(500).send("Something Went Wrong While Importing the Rate Card Data... \nTry Again..!");
                })
            } catch (error) {
                next(error);
                console.log(error)
            }
        }

    });
    api_router.get("/getRateCardInfo", async (req, res) => {
        const { Item, Region } = req.query;
        const Info = await runQuery("select idratecard,Description,UOM from ratecard where Item=? and Region=? and Status='Active'", [Item, Region]);
        Info.length ? res.send(Info[0]) : res.status(500).send("Not Found")
    });
    api_router.get("/getAttachments", async (req, res) => {
        try {
            const attachments = await runQuery(`SELECT A.*,U.Full_Name,date_format(A.Created_Date,'%c/%d/%y') as Created_Date 
                FROM attachments as A left join users U on U.Employee_ID=A.Owner where A.${req.query.Target}=? and A.Status='Active' order by A.Created_Date desc`, [req.query.Value])
            return res.json(attachments)
        } catch (error) {
            console.log(error);
        }
    });
    api_router.post("/updateSessionDetails", async (req, res) => {
        req.session.attachmentsInput = req.body;
        return res.send("ok")
    });
    api_router.post("/updateEstimates", uploadInvoice.single("invoicePdf"), async (req, res) => {
        const { ID, Action, ApprovedDate, Invoiced_Date, Invoice_Number, Payment_Received_Date, Amount_Received, Rejected_Date, Rejection_Comment, invoicePath } = req.body;
        try {
            let serverFilePath = null;
            serverFilePath = invoicePath ? invoicePath : null;
            if (res.req.file) {
                serverFilePath = `/public/uploads/Invoices/${res.req.file.filename}`;
            }
            if (Action == "Rejected" || Action == "Bulk-Rejected") {
                // await runQuery("delete from estimates where idestimates=?", [ID])
                await runQuery("update estimates set Status=?,`Rejected Date`=?,`Rejection Comment`=? where FIND_IN_SET(idestimates,?)", ["Rejected", Rejected_Date, Rejection_Comment, ID])
            } else if (Action == "Reserved" || Action == "Bulk-Reserved") {
                await runQuery("update estimates set Status=?,ApprovedDate=? where FIND_IN_SET(idestimates,?)", ["Reserved", ApprovedDate, ID])
            } else if (Action == "Invoiced" || Action == "Bulk-Invoiced") {
                await runQuery("update estimates set Status=?,`Invoiced Date`=?,`Invoice Number`=?,invoicePath=? where FIND_IN_SET(idestimates,?)", ["Invoiced", Invoiced_Date, Invoice_Number, serverFilePath, ID])
            } else if (Action == "Payment Received" || Action == "Bulk-Payment-Received") {
                await runQuery("update estimates set Status=?,`Payment Received Date`=?,`Amount Received`=?,paymentMarkedOn=?,paymentMarkedBy=? where FIND_IN_SET(idestimates,?)", ["Payment Received", Payment_Received_Date, Amount_Received, getTimeStamp(), req.session.UserID, ID])
                const { partialPayment } = req.body;
                if (partialPayment) {
                    const ids = partialPayment.filter(d => d.isPartial).map(d => d.id).join(",");
                    const receivedQtyCase = partialPayment
                        .map(d => `WHEN ${d.id} THEN ${d.receivedQty}`)
                        .join(" ");
                    const isPartialCase = partialPayment
                        .map(d => `WHEN ${d.id} THEN '${d.isPartial ? "Yes" : "No"}'`)
                        .join(" ");
                    const pendingQtyCase = partialPayment
                        .map(d => `WHEN ${d.id} THEN ${d.pendingQty?d.pendingQty:0}`)
                        .join(" ");
                    const updateQuery = `UPDATE estimates SET 
                        Quantity =  CASE idestimates ${receivedQtyCase} END,
                        paidQuantity = COALESCE(paidQuantity, CASE idestimates ${receivedQtyCase} END),
                        pendingQuantity = COALESCE(pendingQuantity, CASE idestimates ${pendingQtyCase} END),
                        isPartialPayment = COALESCE(isPartialPayment, CASE idestimates ${isPartialCase} END)
                        WHERE idestimates IN (${ids})`;
                    await runQuery(updateQuery);
                    for (const payment of partialPayment) {
                        if (payment.isPartial) {
                            const [updatedEstimates] = await runQuery("Select * from estimates where idestimates=?", [payment.id]);
                            if (updatedEstimates) {
                                const newEstimate = { ...updatedEstimates };
                                delete newEstimate.idestimates;
                                delete newEstimate.paymentMarkedOn;
                                delete newEstimate.paymentMarkedBy;
                                delete newEstimate.pendingQuantity;
                                delete newEstimate.paidQuantity;
                                delete newEstimate.isPartialPayment
                                delete newEstimate['Payment Received Date'];
                                delete newEstimate['Amount Received'];
                                newEstimate.Quantity = payment.pendingQty;
                                newEstimate.Status = "Invoiced";
                                newEstimate.Created_Date = getTimeStamp();
                                newEstimate.Created_By = req.session.UserID;
                                await runQuery("insert into estimates set ?", { ...newEstimate });
                            }
                        }
                    };
                }
            }
            return res.status(200).send("OK")
        } catch (error) {
            if (res.req.file) {
                const fullPath = path.join(__dirname, "..", "public", "uploads", "Invoices", req.file.filename);
                fs.unlink(fullPath, unlinkErr => {
                    if (unlinkErr) console.error("Failed to delete file:", unlinkErr, fullPath);
                });
            }
            if (error.sqlState == "45000") {
                return res.status(500).send(JSON.stringify(new Notification("Error..!", `${error.sqlMessage}`, 'error', '3s')))
            } else {
                console.log(error)
                return res.status(500).send(error)
            }

        }
    })
    async function parseStringToObject(str, query) {
        let obj = {};
        const parts = str.split(';').map(part => part.trim());
        obj['Job_ID'] = query['Job_ID'];
        obj['BAU'] = query['BAU'];
        obj['Type'] = query['Type'];
        obj['Scope'] = query['Scope'];
        for (const part of parts) {
            if (part.includes('=')) {
                const [key, value] = part.split('=').map(p => p.trim());
                const queryKey = `${value}_Value`;  // Add "_Value" to the key
                obj[key] = query[queryKey] || "1";
                let temp = await runQuery("select * from ratecard where Item=?", key);
                if (temp.length) {
                    obj[`${key}_Desc`] = temp[0].Description;
                }
            } else {
                const queryKey = `${part}_Value`;  // Add "_Value" even if no "="
                obj[part] = query[queryKey] || "1";
                let temp = await runQuery("select * from ratecard where Item=?", part);
                if (temp.length) {
                    obj[`${part}_Desc`] = temp[0].Description;
                }
            }
        };
        return obj;
    }
    api_router.get("/generateLabourCode", async (req, res) => {
        try {
            const Data = { ...req.query };
            const temp = req.query;
            const UnwantedValue = ["Support_Placement_GT_Value", "Cable_Placement_GT_Value", "Coax_Placement_GT_Value", "Fiber_Placement_GT_Value", "Outdoor_Survey_GT_Value", "Splice_Updates_Count_Value", "Splice_Additions_Count_Value", "Job_ID", "Scope", "Mode"];
            UnwantedValue.forEach(key => delete Data[key]);
            const conditions = [];
            for (const key in Data) {
                const value = Data[key];
                if (value !== "" && value !== undefined) {
                    conditions.push(`${key} = '${value}'`);
                }
            }
            const whereClause = conditions.length > 0 ? conditions.join(" AND ") : "";
            let LBCode = await runQuery("Select * from labour_code_truth_table where " + whereClause)
            if (LBCode.length && LBCode[0].LabourCodes != "Invalid") {
                let code = LBCode[0].LabourCodes;
                let result = await parseStringToObject(code, temp);
                result['username'] = req.session.UserData.Full_Name,
                    result['time'] = getTimeStamp()
                return res.json(result)

            } else {
                return res.status(400).send("Invalid Inputs")
            }
        } catch (error) {
            console.log(error)
            return res.status(400).send("Internal Server Error")
        }

    })
    api_router.get("/GetValidProdTask", async (req, res) => {
        const { Milestone_Name } = req.query;
        const ProdTaskList = await runQuery("Select TaskLabel,TaskName from task where Type='Production' and Status in ('Ready for QC','Completed') and Milestone_Name=?", Milestone_Name);
        return res.status(200).json(ProdTaskList);
    });
    api_router.get("/checkMilestoneExisting", async (req, res) => {
        const { Milestone_Name, Project_ID, idProject } = req.query;
        try {
            let status = false;
            let milestoneName = `${Project_ID.slice(0, 1) + Project_ID.slice(-5)}-${Milestone_Name}`;
            let temp = await runQuery("Select count(*) as Count from milestone where idProjects=? and Project_ID=? and Milestone_Name LIKE ?", [idProject, Project_ID, milestoneName + '%']);
            let Count = temp[0].Count;
            if (Count) {
                temp = await runQuery("Select * from milestone where idProjects=? and Project_ID=? and Milestone_Name LIKE  ? and Milestone_Status not in ('Short-Closed','Approved','Submitted - Awaiting Approval')", [idProject, Project_ID, milestoneName + '%']);
                if (temp.length == 0) {
                    //If Given Milestone is not in WIP
                    status = true;
                } else {
                    // If Given Milestone is in WIP 
                    status = false;
                }
            } else {
                // If No Milestone Exist with given name.
                status = "New";
            }
            return res.status(200).send(status);
        } catch (error) {
            console.log(error);
            return res.status(300).send(false);
        }

    });
    api_router.get("/checkSubtaskClosed/:TaskID", async (req, res) => {
        try {
            // Check if the user is authenticated
            if (!req.session.UserID) {
                return res.status(401).json({ message: "Unauthorized Request" });
            }

            // Destructure TaskID from request parameters
            const { TaskID } = req.params;

            // Query the database for subtasks with the given conditions
            const SubtaskList = await runQuery("SELECT * FROM subtask WHERE Status IN ('WIP', 'YTS') AND Task_Name = ?", [TaskID]);

            // Send the appropriate response based on the query result
            if (SubtaskList.length > 0) {
                return res.status(200).json({ status: "Not Cleared" });
            } else {
                return res.status(200).json({ status: "All Clear" });
            }
        } catch (error) {
            console.error("Error in /checkSubtaskClosed route:", error);
            return res.status(500).json({ message: "Internal Server Error" });
        }
    });

    api_router.get("/checkMarkupClosed/:TaskID", async (req, res) => {
        try {
            // Check if the user is authenticated
            if (!req.session.UserID) {
                return res.status(401).json({ message: "Unauthorized Request" });
            }

            // Destructure TaskID from request parameters
            const { TaskID } = req.params;

            // Query the database for subtasks with the given conditions
            const SubtaskList = await runQuery("SELECT * FROM markup WHERE Status IN ('WIP', 'YTS') AND Task_Name = ?", [TaskID]);

            // Send the appropriate response based on the query result
            if (SubtaskList.length > 0) {
                return res.status(200).json({ status: "Not Cleared" });
            } else {
                return res.status(200).json({ status: "All Clear" });
            }
        } catch (error) {
            console.error("Error in /checkMarkupClosed route:", error);
            return res.status(500).json({ message: "Internal Server Error" });
        }
    });
    api_router.get("/downloadEstimates/", async (req, res) => {
        let { Customer, Program, Job_ID, isFilter, Status } = req.query;
        if (!Customer?.length || !Program?.length) {
            req.session.Notifications = JSON.stringify(new Notification('Error..!', `Export failed due to mandatory fields being left empty.`, 'error', '3s'));
            return res.redirect(req.headers.referer);
        }
        Customer = Array.isArray(Customer) ? Customer.filter(element => element.length !== 0) : [Customer]
        Program = Array.isArray(Program) ? Program.filter(element => element.length !== 0) : [Program]
        Status = Array.isArray(Status) ? Status.filter(element => element.length !== 0).map((elem) => `'${elem}'`).join(",") : `'${Status}'`
        try {
            if (!req.session.UserID) {
                return res.status(401).json({ message: "Unauthorized Request" });
            }
            let logs = [];
            let log;
            for (let customers of Customer) {
                for (let programs of Program) {
                    let where_string = ""
                    try {
                        if (isFilter == "true") {
                            if (Status) {
                                where_string += ` and E.Status in (${Status})`
                            }
                            if (Job_ID) {
                                where_string += ` and E.Job_ID='${Job_ID}'`
                            }
                            log = await runQuery("SELECT R.Region as RateCardRegion,P.SOW,P.Status as ProjectStatus,DATE_FORMAT(P.ReceivedDate,'%c/%d/%y') as ReceivedDate,DATE_FORMAT(P.SubmittedDate,'%c/%d/%y') as SubmittedDate,DATE_FORMAT(P.ApprovedDate ,'%c/%d/%y') as Project_ApprovedDate,DATE_FORMAT(E.`Invoiced Date` ,'%c/%d/%y') as Invoiced_Date,DATE_FORMAT(E.`Rejected Date` ,'%c/%d/%y') as Rejected_Date,DATE_FORMAT(E.`Payment Received Date` ,'%c/%d/%y') as Payment_Received_Date,DATE_FORMAT(E.`ApprovedDate` ,'%c/%d/%y') as LCApprovedDate, E.*,round((E.Quantity*E.UnitPrice),2) as Total_Revenue FROM estimates as E join ratecard as R join " + projectTableNames[customers].Table + " as P on R.idratecard=E.idratecard and P.idProjects=E.idProject and " + "P." + projectTableNames[customers].ProjectColumn + "=E.Job_ID and E.Program=? " + where_string, [programs]);
                        } else {
                            log = await runQuery("SELECT R.Region as RateCardRegion,P.SOW,P.Status as ProjectStatus,DATE_FORMAT(P.ReceivedDate,'%c/%d/%y') as ReceivedDate,DATE_FORMAT(P.SubmittedDate,'%c/%d/%y') as SubmittedDate,DATE_FORMAT(P.ApprovedDate ,'%c/%d/%y') as Project_ApprovedDate,DATE_FORMAT(E.`Invoiced Date` ,'%c/%d/%y') as Invoiced_Date,DATE_FORMAT(E.`Rejected Date` ,'%c/%d/%y') as Rejected_Date,DATE_FORMAT(E.`Payment Received Date` ,'%c/%d/%y') as Payment_Received_Date,DATE_FORMAT(E.`ApprovedDate` ,'%c/%d/%y') as LCApprovedDate, E.*,round((E.Quantity*E.UnitPrice),2) as Total_Revenue FROM estimates as E join ratecard as R join " + projectTableNames[customers].Table + " as P on R.idratecard=E.idratecard and P.idProjects=E.idProject and " + "P." + projectTableNames[customers].ProjectColumn + "=E.Job_ID and E.Job_ID=?", [Job_ID]);
                        }
                    } catch (error) {
                        console.error(error)
                    }
                    log.forEach(entery => {
                        entery.Customer = customers
                    })
                    logs = logs.concat(log)
                }
            }
            let Excel = new excel.Workbook();
            let Sheet = Excel.addWorksheet("Estimates_Report");
            const Headers = [
                { header: "Reference ID", key: "idestimates", width: 20 },
                { header: "Customer", key: "Customer", width: 20 },
                { header: "Program", key: "Program", width: 20 },
                { header: "Project ID", key: "Job_ID", width: 20 },
                { header: "Region", key: "RateCardRegion", width: 20 },
                { header: "SOW", key: "SOW", width: 20 },
                { header: "Project Status", key: "ProjectStatus", width: 20 },
                { header: "Project Received Date", key: "ReceivedDate", width: 20 },
                { header: "Project Submitted Date", key: "SubmittedDate", width: 20 },
                { header: "Project Approved Date", key: "Project_ApprovedDate", width: 20 },
                { header: "Labor Code", key: "Item", width: 20 },
                { header: "Total Quantity", key: "Quantity", width: 20 },
            ]
            if (req.session.UserRole == "PMO" && req.session.Designation == "Head-OSP Design") {
                Headers.push(
                    { header: "Unit Price", key: "UnitPrice", width: 20 },
                    { header: "Total Revenue", key: "Total_Revenue", width: 20 },
                )
            }
            Headers.push(
                { header: "LC Status", key: "Status", width: 20 },
                { header: "LC Reserved Date", key: "LCApprovedDate", width: 20 },
                { header: "Invoice Number", key: "Invoice Number", width: 20 },
                { header: "Invoice Date", key: "Invoiced_Date", width: 20 },
                { header: "Payment Received Date", key: "Payment_Received_Date", width: 20 },
            )
            if (req.session.UserRole == "PMO" && req.session.Designation == "Head-OSP Design") {
                Headers.push(
                    { header: "Amount Received", key: "Amount Received", width: 20 }
                )
            }
            Headers.push(
                { header: "Rejected Date", key: "Rejected_Date", width: 20 },
                { header: "Rejection Comment", key: "Rejection Comment", width: 20 },
            )
            Sheet.columns = Headers;
            logs.forEach(row => {
                // Replace empty fields in the row with "-"
                Object.keys(row).forEach(key => {
                    if (row[key] === null || row[key] === undefined || row[key] === '') {
                        row[key] = '-';
                    }
                    if (key === "idestimates") {
                        row[key] = encodePK(row[key])
                    }
                });
                Sheet.addRow(row);
            });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=QGPMS-Estimates-Report-${getTimeStamp()}.xlsx`);
            await Excel.xlsx.write(res)
        } catch (error) {
            console.log(error)
            return res.status(500).send(error)
        }
    });
    api_router.get("/downloadWorkDone", async (req, res) => {
        let { WD_Customer, WD_Program, Job_ID, isFilter, idProjects, WorkedMonth_From, WorkedMonth_To } = req.query;
        let Customer = req.query.WD_Customer || req.query.Customer;
        let Program = req.query.WD_Program || req.query.Program;
        if (!Customer?.length || !Program?.length) {
            req.session.Notifications = JSON.stringify(new Notification('Error..!', `Export failed due to mandatory fields being left empty.`, 'error', '3s'));
            return res.redirect(req.headers.referer);
        }
        Customer = Array.isArray(Customer) ? Customer.filter(element => element.length !== 0) : [Customer]
        Program = Array.isArray(Program) ? Program.filter(element => element.length !== 0) : [Program]
        try {
            if (!req.session.UserID) {
                return res.status(401).json({ message: "Unauthorized Request" });
            }
            let logs = [];
            let log;
            for (let customers of Customer) {
                for (let programs of Program) {
                    let where_string = ""
                    try {
                        if (isFilter == "true") {
                            if (WorkedMonth_From && WorkedMonth_To) {
                                where_string += ` and date_format(M.WorkedMonth,"%Y-%m") between'${WorkedMonth_From}' and '${WorkedMonth_To}'`
                            }
                            log = await runQuery("SELECT M.*,(M.UnitPrice*M.Quantity) as Total_Revenue,DATE_FORMAT(M.WorkedMonth, '%M-%y') AS month_year,R.Region as RateCardRegion,P.SOW,P.Status as ProjectStatus FROM monthlyworkdone as M inner join " + projectTableNames[customers].Table + " as P join ratecard as R on P.idProjects=M.idProject and R.idratecard=M.idratecard and " + "P." + projectTableNames[customers].ProjectColumn + "=M.Job_ID and M.MovedToEstimate='No' and M.Program=? " + where_string, [programs]);
                        } else {
                            log = await runQuery("SELECT M.*,(M.UnitPrice*M.Quantity) as Total_Revenue,DATE_FORMAT(M.WorkedMonth, '%M-%y') AS month_year,R.Region as RateCardRegion,P.SOW,P.Status as ProjectStatus FROM monthlyworkdone as M inner join " + projectTableNames[customers].Table + " as P join ratecard as R on P.idProjects=M.idProject and R.idratecard=M.idratecard and " + "P." + projectTableNames[customers].ProjectColumn + "=M.Job_ID where M.Job_ID=? and M.MovedToEstimate='No' and M.idProject=?", [Job_ID, idProjects]);
                        }
                    } catch (error) {
                        console.error(error)
                    }
                    log.forEach(entery => {
                        entery.Customer = customers;
                    })
                    logs = logs.concat(log)
                }
            }
            let Excel = new excel.Workbook();
            let Sheet = Excel.addWorksheet("Monthly_Work_Done_Report");
            const Headers = [
                { header: "WD Reference ID", key: "idmonthlyworkdone", width: 20 },
                { header: "Customer", key: "Customer", width: 20 },
                { header: "Project Name", key: "Program", width: 20 },
                { header: "Job ID", key: "Job_ID", width: 20 },
                { header: "Region", key: "RateCardRegion", width: 20 },
                { header: "SOW", key: "SOW", width: 20 },
                { header: "Labor Code", key: "Item", width: 20 },
                { header: "Total Quantity", key: "Quantity", width: 20 },
            ]
            if (req.session.UserRole == "PMO" && req.session.Designation == "Head-OSP Design") {
                Headers.push(
                    { header: "Unit Price", key: "UnitPrice", width: 20 },
                    { header: "Total Revenue", key: "Total_Revenue", width: 20 },
                )
            }
            Headers.push(
                { header: "Accounted in Month", key: "month_year", width: 20 },
                { header: "isMovedToEstimate", key: "MovedToEstimate", width: 20 },
            )
            Sheet.columns = Headers;
            logs.forEach(row => {
                // Replace empty fields in the row with "-"
                Object.keys(row).forEach(key => {
                    if (row[key] === null || row[key] === undefined || row[key] === '') {
                        row[key] = '-';
                    }
                    if (key == "idmonthlyworkdone") {
                        row[key] = encodePK(row[key]);
                    }
                });
                Sheet.addRow(row);
            });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=QGPMS-Monthly-Workdone-Report-${getTimeStamp()}.xlsx`);
            await Excel.xlsx.write(res)
        } catch (error) {
            console.log(error)
            return res.status(500).send(error)
        }
    });
    // Estimates Import Template
    api_router.get("/DownlaodEstimateImportTemplate", async (req, res) => {
        if (!req.session.UserID) {
            return res.status(401).json({ message: "Unauthorized Request" });
        }
        let headers = new Array()
        let temp = [
            "Customer",
            "Program",
            "Job_ID",
            "SOW",
            "Region",
            "Item",
            "Quantity",
            "Status",
            "ApprovedDate",
            "Invoiced Date",
            "Invoice Number",
        ]
        // let temp = ["Customer", "Project", "Project ID", "Region", "SOW", "Labor Code", "Total Quantity"]
        // temp.push(...["LC Status", "LC Reserved Date", "Invoice Number", "Invoice Date", "Payment Received Date"])
        if (req.session.UserRole == "PMO" && req.session.Designation == "Head-OSP Design") {
            temp.push("Amount Received", "Payment Received Date")
        }
        temp.push("Rejected Date", "Rejection Comment")
        temp.forEach(columnName => {
            headers.push({ header: columnName, width: 20 })
        })
        let Excel = new excel.Workbook();
        let Sheet = Excel.addWorksheet("Estimates_Import_Template");
        Sheet.columns = headers;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Estimates-Import-Template-${getTimeStamp()}.xlsx`);
        await Excel.xlsx.write(res)
    });
    // WorkDone Import Template
    api_router.get("/DownlaodWorkDoneImportTemplate", async (req, res) => {
        if (!req.session.UserID) {
            return res.status(401).json({ message: "Unauthorized Request" });
        }
        let headers = new Array()
        let temp = [
            "Customer",
            "Program",
            "Job_ID",
            "SOW",
            "Region",
            "Item",
            "Quantity",
            "Accounted Month"
        ]
        // let temp = ["Customer", "Project", "Project ID", "Region", "SOW", "Labor Code", "Total Quantity"]
        // temp.push(...["LC Status", "LC Reserved Date", "Invoice Number", "Invoice Date", "Payment Received Date"])
        temp.forEach(columnName => {
            headers.push({ header: columnName, width: 20 })
        })
        let Excel = new excel.Workbook();
        let Sheet = Excel.addWorksheet("Monthly_WorkDone_Import_Template");
        Sheet.columns = headers;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=QGPMS-Monthly-WorkDone-Import-Template-${getTimeStamp()}.xlsx`);
        await Excel.xlsx.write(res)
    });
    // Old Bulk Estimates Updations 
    api_router.post("/updateEstimate", async (req, res) => {
        if (!req.session.UserID) {
            return res.status(401).json({ message: "Unauthorized Request" });
        }
        const rows = req.body.rows;
        const successResults = [];
        const failedResults = [];
        const statusOrder = ['Pending', 'Rejected', 'Reserved', 'Invoiced', 'Payment Received'];
        try {
            for (const row of rows) {
                let { id, data } = row;
                let [
                    idestimates,
                    Customer,
                    Project,
                    ProjectID,
                    Region,
                    SOW,
                    ProjectStatus,
                    ReceivedDate,
                    SubmittedDate,
                    Project_ApprovedDate,
                    LaborCode,
                    Quantity,
                    ...rest
                ] = data;
                let AmountReceived, Rejected_Date, Rejection_Comment, UnitPrice, Total_Revenue;
                if (req.session.UserRole == "PMO" && req.session.Designation == "Head-OSP Design") {
                    [UnitPrice, Total_Revenue, ...rest] = rest;
                }
                let [
                    LCStatus,
                    LCApprovedDate,
                    InvoiceNumber,
                    InvoiceDate,
                    PaymentReceivedDate,
                    ...remainingRest
                ] = rest;
                if (req.session.UserRole == "PMO" && req.session.Designation == "Head-OSP Design") {
                    [AmountReceived, ...remainingRest] = remainingRest;
                }
                [Rejected_Date, Rejection_Comment] = remainingRest;
                AmountReceived = AmountReceived === "-" ? null : AmountReceived;
                Rejected_Date = Rejected_Date === "-" ? null : Rejected_Date;
                // Validate against the database
                try {
                    const [existingRows] = await runQuery(`SELECT E.* FROM estimates AS E 
                 JOIN ratecard AS R ON R.idratecard = E.idratecard 
                 JOIN ${projectTableNames[Customer].Table} AS P ON P.idProjects = E.idProject AND P.${projectTableNames[Customer].ProjectColumn} = E.Job_ID
                 WHERE R.Region = ? AND P.SOW = ? AND P.${projectTableNames[Customer].ProjectColumn} = ? AND E.Item=? AND E.idestimates=?`, [Region, SOW, ProjectID, LaborCode, idestimates]);
                    if (existingRows.length === 0) {
                        failedResults.push({ id, message: 'Validation failed: Record not found in the database.' });
                        continue;
                    }
                    const currentStatus = existingRows.Status;
                    const currentStatusIndex = statusOrder.indexOf(currentStatus);
                    const newStatusIndex = statusOrder.indexOf(LCStatus)
                    if (newStatusIndex === -1) {
                        console.log(LCStatus)
                        failedResults.push({ id, message: "Invalid ststus provided." })
                        continue;
                    }
                    if (newStatusIndex < currentStatusIndex) {
                        failedResults.push({ id, message: `Cannot rollback status from "${currentStatus}" to "${LCStatus}"` })
                        continue;
                    }
                    // Prepare updates based on LC Status
                    const updates = [];
                    const updateValues = [];


                    if (['Reserved', 'Invoiced', 'Payment Received'].includes(LCStatus)) {
                        if (!LCApprovedDate) {
                            failedResults.push({ id, message: 'LC Reserved Date is required for Reserved, Invoiced, or Payment Received status.' });
                            continue;
                        } else {
                            updates.push('E.`Status` = ?', 'E.`ApprovedDate` = if(E.`ApprovedDate` is null,STR_TO_DATE(?,"%m/%d/%y"),E.`ApprovedDate`)');
                            updateValues.push(LCStatus, LCApprovedDate);
                        }
                    }

                    if (['Invoiced', 'Payment Received'].includes(LCStatus)) {
                        // const regex = /^QGKA\/\d{2}-\d{2}\/\d{4}$/; 
                        const regex = /^[A-Z]{4}\/\d{2}-\d{2}\/\d{4}$/;
                        if (!regex.test(InvoiceNumber)) {
                            failedResults.push({ id, message: "Invalid Invoice Number." })
                            continue;
                        }
                        if (!InvoiceDate || !InvoiceNumber || !LCApprovedDate) {
                            failedResults.push({ id, message: 'LC Reserved Date, InvoiceDate and InvoiceNumber are required for Invoiced or Payment Received status.' });
                            continue;
                        } else {
                            updates.push('E.`Invoiced Date` = if(E.`Invoiced Date` is null,STR_TO_DATE(?,"%m/%d/%y"),E.`Invoiced Date`)', 'E.`Invoice Number` = if(E.`Invoice Number` is null,?,E.`Invoice Number`)');
                            updateValues.push(InvoiceDate, InvoiceNumber);
                        }
                    }

                    if (LCStatus === 'Payment Received') {
                        if (!PaymentReceivedDate) {
                            failedResults.push({ id, message: 'Payment Received Date is required for Payment Received status.' });
                            continue;
                        } else {
                            updates.push('E.`Payment Received Date` = if(E.`Payment Received Date` is null,STR_TO_DATE(?,"%m/%d/%y"),E.`Payment Received Date`)');
                            updateValues.push(PaymentReceivedDate);
                        }
                        if (req.session.UserRole == "PMO" && req.session.Designation == "Head-OSP Design") {
                            updates.push('E.`Amount Received` = if(E.`Amount Received` is null,?,E.`Amount Received`)');
                            updateValues.push(AmountReceived);
                        } else if (AmountReceived) {
                            failedResults.push({ id, message: 'Not authorized to update Amount Received.' });
                            continue;
                        }
                    }
                    if (LCStatus == "Rejected") {
                        if (!Rejected_Date || !Rejection_Comment) {
                            failedResults.push({ id, message: 'Rejected Date and Rejection Comment are required for Rejected status.' });
                            continue;
                        } else {
                            updates.push('E.`Status` = ?', 'E.`Rejected Date` = if(E.`Rejected Date` is null,STR_TO_DATE(?,"%m/%d/%y"),E.`Rejected Date`)', 'E.`Rejection Comment` = if(E.`Rejection Comment` is null,?,E.`Rejection Comment`)');
                            updateValues.push(LCStatus, Rejected_Date, Rejection_Comment)
                        }
                    }
                    // Skip if no updates are required
                    if (updates.length === 0) {
                        failedResults.push({ id, message: 'No fields to update.' });
                        continue;
                    }
                    let updateResult = await runQuery(`UPDATE estimates AS E 
                            JOIN ratecard AS R ON R.idratecard = E.idratecard 
                            JOIN ${projectTableNames[Customer].Table} AS P ON P.idProjects = E.idProject AND P.${projectTableNames[Customer].ProjectColumn} = E.Job_ID
                            SET ${updates.join(', ')}  WHERE R.Region = ? AND P.SOW = ? AND P.${projectTableNames[Customer].ProjectColumn} = ? AND E.Item=? AND E.idestimates=?`, [...updateValues, Region, SOW, ProjectID, LaborCode, idestimates])
                    if (updateResult.affectedRows == 0) {
                        failedResults.push({ id, message: 'No fields to update in the database.' });
                        continue;
                    } else {
                        successResults.push({ id, message: 'Record updated successfully.' });
                        continue;
                    }
                } catch (updateError) {
                    console.log(updateError)
                    failedResults.push({ id, message: `Update failed: ${updateError.message}` });
                }
            }
            res.json({ success: successResults, failed: failedResults });
        } catch (error) {
            console.error('Error processing records:', error);
            res.status(500).send({ error: 'Internal server error.', details: error.message });
        }
    })
    api_router.post("/importEstimate", async (req, res) => {
        if (!req.session.UserID) {
            return res.status(401).json({ message: "Unauthorized Request" });
        }
        const rows = req.body.rows;
        const successResults = [];
        const failedResults = [];
        const skippedResults = [];
        let materPMOHeader = new Set([
            "Customer",
            "Program",
            "Job_ID",
            "Region",
            "SOW",
            "Item",
            "Quantity",
            "Status",
            "ApprovedDate",
            "Invoiced Date",
            "Invoice Number",
            "Rejected Date",
            "Rejection Comment",
            "Amount Received",
            "Payment Received Date"
        ])
        let materHeader = new Set([
            "Customer",
            "Program",
            "Job_ID",
            "Region",
            "SOW",
            "Item",
            "Quantity",
            "Status",
            "ApprovedDate",
            "Invoiced Date",
            "Invoice Number",
            "Rejected Date",
            "Rejection Comment",
            "Payment Received Date"
        ])
        try {
            for (const row of rows) {
                let { id, data } = row;
                const inputHeaders = Object.keys(data);
                let isSubset = null;
                if ((req.session.UserRole == "PMO" && req.session.Designation == "Head-OSP Design")) {
                    isSubset = inputHeaders.every(item => [...materPMOHeader].includes(item));
                } else {
                    isSubset = inputHeaders.every(item => [...materHeader].includes(item));
                }
                if (!isSubset) {
                    failedResults.push({ id, message: "Invalid Data Format" })
                    continue;
                }
                if ((inputHeaders.includes("Amount Received") || inputHeaders.includes("Payment Received Date")) && (req.session.UserRole != "PMO" && req.session.Designation != "Head-OSP Design")) {
                    failedResults.push({ id, message: "Not authorized to update payment deatils" })
                    continue;
                }
                const { Customer, Region, SOW, Job_ID, Item, Status, Program } = data;
                // if (! await isValidCustomer(Customer)) {
                //     failedResults.push({ id, message: "Invalid Customer" })
                //     continue;
                // }
                // Check-1 : Validate Customer and Program
                const [customer] = await runQuery("SELECT * FROM customers where lower(name)=? limit 1", [Customer.toLowerCase()])
                const [isValidProgram] = await runQuery(`SELECT * FROM ratecard  where lower(SUBSTRING_INDEX(Program,"-",1))=? and lower(SUBSTRING_INDEX(Program,"-",-1))=?`, [Customer.toLowerCase(), Program.toLowerCase()])
                if (!customer || !isValidProgram) {
                    failedResults.push({ id, message: "Invalid Customer/Program." })
                    continue;
                }
                // Check-2 : Validate ProjectID and SOW
                const [projectInfo] = await runQuery(`Select * from ${Program == "AT&T" ? projectTableNames[Program].Table : projectTableNames[Customer].Table} where ${Program == "AT&T" ? projectTableNames[Program].ProjectColumn : projectTableNames[Customer].ProjectColumn}=? and SOW=?`, [Job_ID.trim(), SOW.trim()])
                if (!(projectInfo)) {
                    console.log(Customer, SOW, Job_ID)
                    failedResults.push({ id, message: "Invalid Job ID or SOW" })
                    continue;
                }
                // Check-3 : Validate Region for Customer and Program
                const [isValidRegion] = await runQuery("SELECT * FROM ratecard where SUBSTRING_INDEX(Program,\"-\",-1)=? and Region=? and lower(Customer)=lower(?) and Status='Active'", [Program, Region, Customer])
                if (!isValidRegion) {
                    failedResults.push({ id, message: "This region isn’t supported for the chosen customer and program." })
                    continue;
                }
                // Check-4 : Validate Line Item for Customer, Program and Region
                const [isValidLineItem] = await runQuery("SELECT * FROM ratecard where SUBSTRING_INDEX(Program,\"-\",-1)=? and Region=? and lower(Customer)=lower(?) and Item=? and Status='Active'", [Program, Region, Customer, Item])
                if (!(isValidLineItem)) {
                    failedResults.push({ id, message: "This labor code does not match the selected region." })
                    continue;
                }
                // const [ratecardInfo] = await runQuery("select idratecard,UnitPrice from ratecard where Item=? and Region=? and Status='Active'", [Item, Region])
                // if (!(ratecardInfo)) {
                //     failedResults.push({ id, message: "Invalid Labor Code" })
                //     continue;
                // }
                if (['Reserved', 'Invoiced', 'Payment Received'].includes(Status) && (!data.ApprovedDate)) {
                    failedResults.push({ id, message: 'LC Reserved Date is required for Reserved, Invoiced, or Payment Received status.' });
                    continue;
                }
                if (['Invoiced', 'Payment Received'].includes(Status)) {
                    const regex = /^[A-Z]{4}\/\d{2}-\d{2}\/\d{4}$/;
                    // const regex = /^QGKA\/\d{2}-\d{2}\/\d{4}$/; 
                    if (!data['Invoiced Date'] || !data['Invoice Number'] || !data.ApprovedDate) {
                        failedResults.push({ id, message: 'LC Reserved Date, InvoiceDate and InvoiceNumber are required for Invoiced or Payment Received status.' });
                        continue;
                    }
                    if (!regex.test(data['Invoice Number'])) {
                        failedResults.push({ id, message: "Invalid Invoice Number." })
                        continue;
                    }
                }

                if (Status === 'Payment Received' && (!data['Payment Received Date'])) {
                    failedResults.push({ id, message: 'Payment Received Date is required for Payment Received status.' });
                    continue;
                }
                if (Status == "Rejected" && (!data['Rejected Date'] || !data['Rejection Comment'])) {
                    failedResults.push({ id, message: 'Rejected Date and Rejection Comment are required for Rejected status.' });
                    continue;
                }
                const { idProjects } = projectInfo;
                const { idratecard, UnitPrice } = isValidLineItem;
                data.UnitPrice = UnitPrice;
                data.idProject = idProjects;
                data.idratecard = idratecard;
                data.Program = getProgram(Customer.toLowerCase(), Program.toLowerCase());
                delete data.Customer
                delete data.SOW
                delete data.Region
                data.Status = data.Status || "Pending";
                const whereClause = Object.entries(data).map(([key, _]) => `\`${key}\`=?`).join(" AND ")
                const duplicateEntry = await runQuery(`Select * from estimates where ${whereClause}`, Object.values(data));
                if (duplicateEntry.length) {
                    skippedResults.push({ id, message: "Duplicate Entry." })
                    continue;
                }
                // Adding Creation Deatiks after duplicate check
                data.Created_Date = getTimeStamp();
                data.Created_By = req.session.UserID;
                try {
                    let result = await runQuery("Insert into estimates set ?", [data])
                    successResults.push({ id, message: "Successfully Imported" })
                } catch (error) {
                    if (error.sqlState == 45000) {
                        failedResults.push({ id, message: error.sqlMessage })
                        continue;
                    } else {
                        failedResults.push({ id, message: "Failed to Import" })
                        continue;
                    }
                }
            }
            res.json({ success: successResults, failed: failedResults, warning: skippedResults });
        } catch (error) {
            console.log(error)
            return res.status(500).send(error)
        }
    })
    // Bulk Estimates Work Done
    api_router.post("/updateWorkDone", async (req, res) => {
        if (!req.session.UserID) {
            return res.status(401).json({ message: "Unauthorized Request" });
        }
        const rows = req.body.rows;
        const validWD = [];
        const successMap = new Map();
        const failedMap = new Map();
        try {
            for (const lineItem of rows) {
                const { id, data } = lineItem;
                const { "Labor Code": LC, "Total Quantity": Qty, isMovedToEstimate: isMoved } = data;
                let idmonthlyworkdone = decodePK(data["WD Reference ID"]);
                const [WD_Data] = await runQuery("Select * from monthlyworkdone where idmonthlyworkdone=?", [idmonthlyworkdone]);
                if (!WD_Data) {
                    failedMap.set(id, "Reference ID not matching with the existing records.")
                    continue;
                }
                const { Item, Quantity, MovedToEstimate } = WD_Data;
                if (isMoved != "No" && isMoved != "Yes") {
                    failedMap.set(id, "Record Skipped. Invalid Value for isMovedToEstimate.")
                    continue;
                }
                if (MovedToEstimate == "Yes" && isMoved == "Yes") {
                    failedMap.set(id, "Already moved to Estimates.")
                    continue;
                }
                if (isMoved == "No") {
                    failedMap.set(id, "Record Skipped. No Fields to Update.")
                    continue;
                }
                if (Item != LC || Number(Quantity) != Number(Qty)) {
                    failedMap.set(id, "Item Code/Quantity not matching.")
                    continue;
                }
                validWD.push(idmonthlyworkdone)
            }
            // console.log(validWD)
            if (validWD.length) {
                const selectedWD = await runQuery("Select * from monthlyworkdone where idmonthlyworkdone in (?)", [validWD])
                if (selectedWD.length) {
                    const consolidated = selectedWD.reduce((acc, item) => {
                        const key = `${item.idProject}_${item.Job_ID}_${item.Item}`
                        if (!acc[key]) {
                            acc[key] = { id: item.idmonthlyworkdone, code: item.Item, qty: 0 }
                        }
                        acc[key].qty += item.Quantity;
                        return acc
                    }, {});
                    const result = Object.values(consolidated)
                    console.log(result);
                    const negativeCodes = new Set(result.filter(item => item.qty <= 0).map(item => item.code))
                    const InvalidQuantityEntries = rows.filter(row => negativeCodes.has(row?.data?.['Labor Code']));
                    InvalidQuantityEntries.forEach(row => {
                        const ID = row.id;
                        failedMap.set(ID, "Deduction cannot be applied, because total available quantity is not enough to offset the negative value.")
                    });
                    const WorkDoneID = rows.filter(row => !failedMap.has(row.id)).map(row => decodePK(row.data["WD Reference ID"]));
                    const WorkDoneReferenceID = rows.filter(row => !failedMap.has(row.id)).map(row => row.id);
                    const estimatesInsertPromises = result.map(async row => {
                        const { id, code, qty } = row;
                        const workdoneData = await runQuery("select * from monthlyworkdone where idmonthlyworkdone=? and Item=?", [id, code]);
                        if (workdoneData.length) {
                            let workdone = workdoneData[0];
                            delete workdone.idmonthlyworkdone;
                            delete workdone.WorkedMonth;
                            delete workdone.Created_Date;
                            delete workdone.Created_By;
                            delete workdone.Quantity;
                            delete workdone.MovedToEstimate;
                            delete workdone.isCredeted;
                            workdone.Status = "Pending";
                            // workdone.ApprovedDate = ReservedDate;
                            workdone.Quantity = qty;
                            workdone.Created_By = req.session.UserID;
                            workdone.Created_Date = getTimeStamp();
                            const result = await runQuery("insert into estimates set ?", [workdone])
                            return result;
                        } else {
                            return false;
                        }
                    })
                    const insertresults = await Promise.all(estimatesInsertPromises);
                    const successfulInserts = insertresults.filter(result => result !== false);
                    if (successfulInserts.length === result.length) {
                        sendTostNotification(req.session.UserID, `All workdones moved to estimates successfully.`, 'success');
                    } else {
                        sendTostNotification(req.session.UserID, `Failed to move some workdone.`, 'error');
                    }
                    for (const row of rows) {
                        const ID = row.id;
                        if (!failedMap.has(ID)) {
                            const updateResult = await runQuery("Update monthlyworkdone set MovedToEstimate='Yes' where idmonthlyworkdone=? and MovedToEstimate='No'", [decodePK(row.data["WD Reference ID"])]);
                            if (updateResult.affectedRows > 0) {
                                successMap.set(ID, "This Line Item has been successfully processed.")
                            }
                        }
                    }
                } else {
                    console.log("Unbale to find valid data in DB")
                }
            }
            const success = [...successMap.entries()].map(
                ([id, message]) => ({ id, message })
            );
            const failed = [...failedMap.entries()].map(
                ([id, message]) => ({ id, message })
            );
            res.json({ success: success, failed: failed });
        } catch (error) {
            console.error('Error processing records:', error);
            res.status(500).send({ error: 'Internal server error.', details: error.message });
        }
    })
    // Helper Functions for LC Update Validations
    // order matters (used for rollback + progressive validation)
    const STATUS_ORDER = [
        "Pending",
        "Reserved",
        "Invoiced",
        "Payment Received"
    ];

    // terminal side path
    const TERMINAL_STATUS = ["Rejected"];
    const STATUS_REQUIREMENTS = {
        "Pending": [],
        "Reserved": ["ApprovedDate"],
        "Invoiced": ["Invoice Number", "Invoiced Date"],
        "Payment Received": ["Payment Received Date"],
        "Rejected": ["Rejected Date", "Rejection Comment"],
    };

    const FIELD_KEY_MAP = {
        "Reference ID": "idestimates",
        "idProject": "idProject",
        "idratecard": "idratecard",
        "Project ID": "Job_ID",
        "Program": "Program",
        "Labor Code": "Item",
        "Total Quantity": "Quantity",
        "Unit Price": "UnitPrice",
        "LC Status": "Status",
        "LC Reserved Date": "ApprovedDate",
        "Created_Date": "Created_Date",
        "Created_By": "Created_By",
        "Invoice Date": "Invoiced Date",
        "Invoice Number": "Invoice Number",
        "Payment Received Date": "Payment Received Date",
        "Amount Received": "Amount Received",
        "Rejected Date": "Rejected Date",
        "Rejection Comment": "Rejection Comment",
        "approvalMarkedBy": "approvalMarkedBy",
        "approvedMarkedOn": "approvedMarkedOn",
        "invoiceMarkedBy": "invoiceMarkedBy",
        "invoiceMarkedOn": "invoiceMarkedOn",
        "invoicePath": "invoicePath",
        "paymentMarkedBy": "paymentMarkedBy",
        "paymentMarkedOn": "paymentMarkedOn",
        "creditNoteNumber": "creditNoteNumber",
        "creditNoteDate": "creditNoteDate",
        "creditNoteBy": "creditNoteBy",
        "creditNoteOn": "creditNoteOn",
        "creditNoteReason": "creditNoteReason",
        "creditNotePat": "creditNotePath"
    }
    function parseDateUTC(value) {
        if (!value || value === "-") return null;

        const parts = value.split("/");
        if (parts.length !== 3) return null;

        let [mm, dd, yy] = parts.map(Number);

        // Handle YY → YYYY
        if (yy < 100) {
            yy += 2000;
        }

        // Create UTC date at midnight
        const date = new Date(Date.UTC(yy, mm - 1, dd));

        return isNaN(date.getTime()) ? null : date;
    }
    function mapKeys(obj, keyMap) {
        return Object.keys(obj).reduce((acc, key) => {
            const mappedKey = keyMap[key] || key; // fallback if not mapped
            acc[mappedKey] = obj[key];
            return acc;
        }, {});
    }
    const isValidValue = (v) =>
        v !== null && v !== undefined && v !== "-";

    const statusIndex = (status) =>
        STATUS_ORDER.indexOf(status);
    function isRollback(current, next) {
        // if (TERMINAL_STATUS.includes(current)) return true;
        return (
            statusIndex(next) !== -1 &&
            statusIndex(next) < statusIndex(current)
        );
    }
    function validateProgressiveStatus(record, newStatus) {
        const errors = [];

        // Rejected is a special terminal path
        if (newStatus === "Rejected") {
            STATUS_REQUIREMENTS["Rejected"].forEach((field) => {
                if (!isValidValue(record[field])) {
                    errors.push(`${field} is required for Rejected status`);
                }
            });
            return errors;
        }

        const targetIdx = statusIndex(newStatus);

        if (targetIdx === -1 || targetIdx === 0) {
            errors.push(`Invalid status: ${newStatus}`);
            return errors;
        }

        for (let i = 0; i <= targetIdx; i++) {
            const status = STATUS_ORDER[i];
            const required = STATUS_REQUIREMENTS[status] || [];

            required.forEach((field) => {
                if (!isValidValue(record[field])) {
                    errors.push(
                        `${field} is required to reach status ${newStatus}`
                    );
                }
            });
        }

        return errors;
    }
    function validateDateSequence(record) {
        const errors = [];

        const approvedDate = parseDateUTC(record["Project Approved Date"]);
        const invoiceDate = parseDateUTC(record["Invoice Date"]);
        const paymentDate = parseDateUTC(record["Payment Received Date"]);
        const rejectedDate = parseDateUTC(record["Rejected Date"]);

        // Approved → Invoice
        if (approvedDate && invoiceDate && invoiceDate < approvedDate) {
            errors.push(
                "Invoice Date must be on or after Project Approved Date"
            );
        }

        // Invoice → Payment
        if (invoiceDate && paymentDate && paymentDate < invoiceDate) {
            errors.push(
                "Payment Received Date must be on or after Invoice Date"
            );
        }

        // // Invoice → Rejected
        // if (invoiceDate && rejectedDate && rejectedDate < invoiceDate) {
        //     errors.push(
        //         "Rejected Date must be on or after Invoice Date"
        //     );
        // }

        return errors;
    }
    function validateLCUpdate(existing, updates) {
        const merged = { ...existing, ...updates };
        const currentStatus = existing["Status"];
        const newStatus = merged["Status"];

        const errors = [];

        // 1. Rollback check
        if (isRollback(currentStatus, newStatus)) {
            errors.push(
                `Status rollback not allowed: ${currentStatus} → ${newStatus}`
            );
            return errors;
        }
        // 2. Progressive status validation
        // 3. Date sequence validation (timezone safe)
        errors.push(
            ...validateProgressiveStatus(merged, newStatus),
            ...validateDateSequence(merged)
        );

        return errors;
    }
    api_router.post("/estimatesUpdate", uploadInvoice.array('Invoices'), async (req, res) => {
        if (!req.session.UserID) {
            return res.status(401).json({ message: "Unauthorized Request" });
        }
        let { estData: temp, action } = req.body;
        const estData = JSON.parse(temp);
        const successMap = new Map();
        const failedMap = new Map();
        const skippedMap = new Map();
        let invRequiredList = [];
        let invoiceFileMap = {}
        if (req.files && req.files.length > 0) {
            for (let file of req.files) {
                const serverFilePath = `/public/uploads/Invoices/${file.filename}`;
                invoiceFileMap[file.originalname.split(".")[0]] = { path: serverFilePath }
            }
        }
        const INVOICE_REQUIRED_STATUSES = ['INVOICED', 'PAYMENT RECEIVED'];
        for (let record of estData) {
            const { id, data } = record;
            const { Customer, Propgram, Region, SOW, "Project ID": ProjectID, "Labor Code": LC } = data;
            let idestimates = decodePK(data["Reference ID"]);
            try {
                // const [existingRows] = await runQuery(`SELECT E.* FROM estimates AS E 
                //  JOIN ratecard AS R ON R.idratecard = E.idratecard 
                //  JOIN ${projectTableNames[Customer].Table} AS P ON P.idProjects = E.idProject AND P.${projectTableNames[Customer].ProjectColumn} = E.Job_ID
                //  WHERE R.Region = ? AND P.SOW = ? AND P.${projectTableNames[Customer].ProjectColumn} = ? AND E.Item=? AND E.idestimates=?`, [Region, SOW, ProjectID, LC, idestimates]);
                const [existingRows] = await runQuery(`Select * from estimates where idestimates=? and Job_ID=? and Item=?`, [idestimates, ProjectID, LC]);
                //  console.log("Existing Rows:", existingRows);
                if (existingRows.length === 0) {
                    failedMap.set(id, 'Validation failed: Record not found in the database.');
                    continue;
                }
                const normalizedUpdates = mapKeys(data, FIELD_KEY_MAP);
                const currentStatus = existingRows.Status;
                const newStatus = normalizedUpdates["Status"];
                const newStatusIndex = statusIndex(newStatus);
                const error = validateLCUpdate(existingRows, normalizedUpdates);
                if (error.length > 0) {
                    failedMap.set(id, `Validation failed: ${error.join("; ")}`);
                    continue;
                } else if (action !== "upload") {
                    successMap.set(id, "Validation successful.");

                }
                if (currentStatus.toUpperCase() === newStatus.toUpperCase()) {
                    skippedMap.set(id, `Skipped: The record already has the same status as requested.`);
                    successMap.delete(id);
                    continue;
                }
                const isInvoiceStatus = INVOICE_REQUIRED_STATUSES.includes(newStatus.toUpperCase());
                const wasInvoiveStatus = INVOICE_REQUIRED_STATUSES.includes(currentStatus.toUpperCase());
                const invNumber = normalizedUpdates["Invoice Number"];
                if (isInvoiceStatus && !wasInvoiveStatus) {
                    const [existingInvoiceDeatils] = await runQuery("SELECT `Invoiced Date`,invoicePath FROM estimates WHERE `Invoice Number`=? limit 1", [invNumber]);
                    // console.log("Existing Invoice Details:", existingInvoiceDeatils);
                    if (existingInvoiceDeatils?.invoicePath) {
                        // Use existing invoice attachment
                        normalizedUpdates.invoicePath = existingInvoiceDeatils.invoicePath;
                        normalizedUpdates["Invoiced Date"] = existingInvoiceDeatils["Invoiced Date"];
                    } else {
                        // Invoice attachment is required.
                        invRequiredList.push(invNumber);
                    }
                }
                // Prepare updates
                const invoicedNo = normalizedUpdates["Invoice Number"].replace(/[^a-zA-Z0-9]/g, "");
                if (invoicedNo && invoiceFileMap[invoicedNo]) {
                    normalizedUpdates.invoicePath = invoiceFileMap[invoicedNo].path;
                    normalizedUpdates.invoiceMarkedBy = req.session.UserID;
                    normalizedUpdates.invoiceMarkedOn = getTimeStamp();
                }
                const updates = [];
                const values = [];
                if (newStatus === "Rejected") {
                    if (isValidValue(normalizedUpdates["Rejection Comment"] && isValidValue(normalizedUpdates["Rejected Date"]))) {
                        if (normalizedUpdates["Rejection Comment"].replace(/[^a-zA-Z0-9 ]/g, '').length < 30) {
                            failedMap.set(id, "Rejection Comment must be at least 30 characters long.");
                            successMap.delete(id);
                            continue;
                        }
                        updates.push(
                            '`Rejected Date` = IF(`Rejected Date` IS NULL, ?, `Rejected Date`), ' +
                            '`Rejection Comment` = IF(`Rejection Comment` IS NULL, ?, `Rejection Comment`), ' +
                            '`Status` = ?'
                        );
                        values.push(
                            normalizedUpdates["Rejected Date"],
                            normalizedUpdates["Rejection Comment"].replace(/[^a-zA-Z0-9 ]/g, ''),
                            newStatus
                        );
                    }
                }
                for (let i = 0; i <= newStatusIndex; i++) {
                    const status = STATUS_ORDER[i];
                    const required = STATUS_REQUIREMENTS[status] || [];
                    required.forEach((field) => {
                        if (isValidValue(normalizedUpdates[field])) {
                            updates.push(`\`${field}\` = IF(\`${field}\` IS NULL, ?, \`${field}\`)`);
                            values.push(normalizedUpdates[field]);
                        } else {
                            console.log(`Skipping field ${field} as it is not valid.`);
                        }
                    });
                    updates.push('`Status` = ?');
                    values.push(newStatus);
                }
                if (newStatus === "Invoiced") {
                    updates.push('`approvalMarkedBy`= if (`approvalMarkedBy` IS NULL, ?, `approvalMarkedBy`), `approvedMarkedOn` = IF(`approvedMarkedOn` IS NULL, ?, `approvedMarkedOn`)');
                    values.push(req.session.UserID, getTimeStamp());
                    updates.push('`invoicePath`= if (`invoicePath` IS NULL, ?, `invoicePath`), `invoiceMarkedBy` = IF(`invoiceMarkedBy` IS NULL, ?, `invoiceMarkedBy`), `invoiceMarkedOn` = IF(`invoiceMarkedOn` IS NULL, ?, `invoiceMarkedOn`)');
                    values.push(normalizedUpdates["invoicePath"], req.session.UserID, getTimeStamp());
                }
                if (newStatus === "Payment Received") {
                    updates.push('`approvalMarkedBy`= if (`approvalMarkedBy` IS NULL, ?, `approvalMarkedBy`), `approvedMarkedOn` = IF(`approvedMarkedOn` IS NULL, ?, `approvedMarkedOn`)');
                    values.push(req.session.UserID, getTimeStamp());
                    updates.push('`invoicePath`= if (`invoicePath` IS NULL, ?, `invoicePath`), `invoiceMarkedBy` = IF(`invoiceMarkedBy` IS NULL, ?, `invoiceMarkedBy`), `invoiceMarkedOn` = IF(`invoiceMarkedOn` IS NULL, ?, `invoiceMarkedOn`)');
                    values.push(normalizedUpdates["invoicePath"], req.session.UserID, getTimeStamp());
                    updates.push('`paymentMarkedBy` = IF(`paymentMarkedBy` IS NULL, ?, `paymentMarkedBy`), `paymentMarkedOn` = IF(`paymentMarkedOn` IS NULL, ?, `paymentMarkedOn`)');
                    values.push(req.session.UserID, getTimeStamp());
                }
                if (updates.length > 0 && action === "upload") {
                    const sql = `
                    UPDATE estimates E
                    SET ${updates.join(', ')}
                    WHERE E.idestimates = ?;
                    `;
                    values.push(idestimates);
                    const result = await runQuery(sql, values);
                    if (result.affectedRows === 1) {
                        successMap.set(id, "Record updated successfully.");
                    } else {
                        failedMap.set(id, "Update failed: No rows affected.");
                        successMap.delete(id);
                    }
                }
            } catch (error) {
                if (error?.sqlState === "45000") {
                    failedMap.set(id, error?.sqlMessage);
                    successMap.delete(id);
                    continue;
                }
                console.log(error)
                failedMap.set(id, 'Internal Error.');
                successMap.delete(id);
                continue;
            }
            // console.log("Invoice Required List:", invRequiredList);
        }
        const success = [...successMap.entries()].map(
            ([id, message]) => ({ id, message })
        );
        const failed = [...failedMap.entries()].map(
            ([id, message]) => ({ id, message })
        );
        const skipped = [...skippedMap.entries()].map(
            ([id, message]) => ({ id, message })
        );
        return res.json({ success: success, failed: failed, skipped: skipped, invRequiredList: [...new Set(invRequiredList)] });
    })
    api_router.get("/getPendingTask", async (req, res) => {
        if (req.session.UserID) {
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
                return res.status(200).json({ "TaskInfo": TaskInfo[0], "Timmer Info": activeSession });
            } else {
                return res.status(404).json("There is no active task.")
            }
        } else {
            return res.status(400).json("Unauthorized Request.")
        }
    })

    api_router.get("/getMilestoneList", async (req, res) => {
        if (req.session.UserID) {
            const { JOB_ID, idProjects, Customer } = req.query;
            const data = await runQuery("SELECT u.Full_Name,m.* FROM milestone as m inner join users as u on u.Employee_ID=m.Owner where m.idProjects=? and m.Project_ID=?", [idProjects, JOB_ID]);
            if (data.length) {
                return res.status(200).json({ data: data, Customer: Customer });
            } else {
                return res.status(404).json("Milestone not found.")
            }
        } else {
            return res.status(400).json("Unauthorized Request.")
        }
    })
    function isFutureMonth(dateStr) {
        const input = new Date(dateStr);
        const now = new Date();

        const inputYearMonth = input.getFullYear() * 12 + input.getMonth();
        const currentYearMonth = now.getFullYear() * 12 + now.getMonth();

        // strictly greater → future month only
        return inputYearMonth > currentYearMonth;
    }
    const programMap = {
        mastec: {
            "at&t": "MasTec-AT&T",
            "tillman": "MasTec-Tillman",
            "windstream": "MasTec-Windstream",
            "comcast": "MasTec-Comcast"
        },
        skytec: {
            "comcast": "SkyTec-Comcast"
        },
        atx: {
            "comcast": "ATX-Comcast"
        }
    };
    function getProgram(customer, program) {
        return programMap?.[customer.toLowerCase()]?.[program.toLowerCase()] || null;
    }

    api_router.post("/importWorkDone", async (req, res) => {
        if (!req.session.UserID) {
            return res.status(401).json({ message: "Unauthorized Request" });
        }
        const rows = req.body.rows;
        const successResults = [];
        const failedResults = [];
        const warningResults = [];
        const materHeader = [
            "Customer",
            "Program",
            "Job_ID",
            "Region",
            "Item",
            "Quantity",
            "Accounted Month",
            "SOW"
        ]
        try {
            for (const row of rows) {
                let { id, data } = row;
                const inputHeaders = Object.keys(data);
                const isSubset = inputHeaders.every(item => materHeader.includes(item))
                if (!isSubset) {
                    failedResults.push({ id, message: "Invalid Template" })
                    continue;
                }
                const { Customer, Region, SOW, Job_ID, Item, Program } = data;
                // const [month, day, year] = data["Accounted Month"].split('-');
                // data.WorkedMonth = `${year}-${month}-${day}`;  // YYYY-MM-DD
                data.WorkedMonth = data["Accounted Month"];
                delete data["Accounted Month"];
                const [customer] = await runQuery("SELECT * FROM customers where lower(name)=? limit 1", [Customer.toLowerCase()])
                // const [isValidProgram] = await runQuery("SELECT * FROM ratecard where SUBSTRING_INDEX(Program,\"-\",1)=? and SUBSTRING_INDEX(Program,\"-\",-1)=?", [Customer,Program])
                const [isValidProgram] = await runQuery(`SELECT * FROM ratecard  where lower(SUBSTRING_INDEX(Program,"-",1))=? and lower(SUBSTRING_INDEX(Program,"-",-1))=?`, [Customer.toLowerCase(), Program.toLowerCase()])
                if (!customer || !isValidProgram) {
                    failedResults.push({ id, message: "Invalid Customer/Program." })
                    continue;
                }
                const [projectInfo] = await runQuery(`Select * from ${Program == "AT&T" ? projectTableNames[Program].Table : projectTableNames[Customer].Table} where trim(${Program == "AT&T" ? projectTableNames[Program].ProjectColumn : projectTableNames[Customer].ProjectColumn})=? and trim(SOW)=?`, [Job_ID.trim(), SOW.trim()])
                if (!(projectInfo)) {
                    console.log(Customer, SOW, Job_ID)
                    failedResults.push({ id, message: "Invalid JobID/SOW" })
                    continue;
                }
                const [isValidRegion] = await runQuery("SELECT * FROM ratecard where SUBSTRING_INDEX(Program,\"-\",-1)=? and Region=? and lower(Customer)=lower(?) and Status='Active'", [Program, Region, Customer])
                if (!isValidRegion) {
                    failedResults.push({ id, message: "This region isn’t supported for the chosen customer and program." })
                    continue;
                }
                // const [ratecardInfo] = await runQuery("select idratecard,UnitPrice from ratecard where Item=? and Region=? and Status='Active'", [Item, Region])
                const [isValidLineItem] = await runQuery("SELECT * FROM ratecard where SUBSTRING_INDEX(Program,\"-\",-1)=? and Region=? and lower(Customer)=lower(?) and Item=? and Status='Active'", [Program, Region, Customer, Item])
                if (!(isValidLineItem)) {
                    failedResults.push({ id, message: "This labor code does not match the selected region." })
                    continue;
                }
                if (isFutureMonth(data.WorkedMonth)) {
                    failedResults.push({ id, message: "Accounted Month cannot be in the future." })
                    continue;
                }
                const { idProjects } = projectInfo;
                const { idratecard, UnitPrice } = isValidLineItem;
                data.UnitPrice = UnitPrice;
                data.idProject = idProjects;
                data.idratecard = idratecard;
                data.Program = getProgram(Customer.toLowerCase(), Program.toLowerCase())
                delete data.Customer
                delete data.SOW
                delete data.Region
                const whereClause = Object.entries(data).map(([key, _]) => `\`${key}\`=?`).join(" AND ")
                // Cleare the excess space from the data
                // Trim all string values
                for (let key in data) {
                    if (typeof data[key] === 'string') {
                        data[key] = data[key].trim();
                    }
                }
                const duplicateEntry = await runQuery(`Select * from monthlyworkdone where ${whereClause}`, Object.values(data));
                if (duplicateEntry.length) {
                    failedResults.push({ id, message: "Duplicate Entry" })
                    continue;
                }
                const qty = Number(data.Quantity);
                // Check for existing entries to validate negative quantity
                const existingEntry = await runQuery("select sum(Quantity) as totalExistingQty from monthlyworkdone where Job_ID=? and Item=? and idProject=?", [data.Job_ID, data.Item, data.idProject]);
                const totalExistingQty = existingEntry[0].totalExistingQty;
                // Scenario 1 — First entry cannot be negative
                if (totalExistingQty === null && qty < 0) {
                    failedResults.push({ id, message: "The first work done entry cannot be negative." })
                    continue;
                }
                // Scenario 2 — Negative entry must not exceed existing total
                if (qty < 0 && totalExistingQty + qty < 0) {
                    failedResults.push({ id, message: "This deduction cannot be applied because the total available quantity is not enough to offset the negative value." })
                    continue;
                }
                // Adding Creation Deatiks after validation check
                data.Created_Date = getTimeStamp();
                data.Created_By = req.session.UserID;
                let result = await runQuery("Insert into monthlyworkdone set ?", [data])
                if (result.affectedRows === 1) {
                    successResults.push({ id, message: "Successfully Imported" })
                } else {
                    console.log(result)
                    failedResults.push({ id, message: "Failed to Import" })
                    continue;
                }
                // Scenario 3 — Negative entry makes existing total to "0" then lock the line Item
                if (qty < 0 && (totalExistingQty + qty === 0)) {
                    await runQuery("update monthlyworkdone set MovedToEstimate='Yes' where Job_ID=? and Item=? and idProject=?", [data.Job_ID, data.Item, data.idProject])
                    warningResults.push({ id, message: "Warning: The total quantity for this line item is 0. As a result, the corresponding line item code will be locked and cannot be moved to Estimates or Invoicing." })
                }
            }
            res.json({ success: successResults, failed: failedResults, warning: warningResults });
        } catch (error) {
            console.log(error)
            return res.status(500).send(error)
        }
    })

    // Add Work Dome Entry
    api_router.post("/addWorkDone", async (req, res) => {
        if (req.session.UserID) {
            let WorkDones = req.body;
            // Convert single object → array
            let items = Array.isArray(WorkDones) ? WorkDones : [WorkDones];
            try {
                for (let workDone of items) {
                    workDone.Created_Date = getTimeStamp();
                    workDone.Created_By = req.session.UserID;
                    workDone.WorkedMonth = workDone.WorkedMonth.concat("-01")
                    const qty = Number(workDone.Quantity); // convert string to number
                    // Fetch Unit Price
                    const unitPrice = await runQuery("Select UnitPrice from ratecard where idratecard=? and Status='Active'", [workDone.idratecard])
                    workDone.UnitPrice = unitPrice[0].UnitPrice;
                    // Check for existing entries to validate negative quantity
                    const existingEntry = await runQuery("select sum(Quantity) as totalExistingQty from monthlyworkdone where Job_ID=? and Item=? and idProject=?", [workDone.Job_ID, workDone.Item, workDone.idProject]);
                    const totalExistingQty = existingEntry[0].totalExistingQty;
                    // Scenario 1 — First entry cannot be negative
                    if (totalExistingQty === null && qty < 0) {
                        sendTostNotification(req.session.UserID, "The first work done entry cannot be negative.", 'error');
                        return res.status(406).json("The first work done entry cannot be negative.");
                    }
                    // Scenario 2 — Negative entry must not exceed existing total
                    if (qty < 0 && totalExistingQty + qty < 0) {
                        sendTostNotification(req.session.UserID, "This deduction cannot be applied because the total available quantity is not enough to offset the negative value.", 'error');
                        return res.status(406).json("This deduction cannot be applied because the total available quantity is not enough to offset the negative value.");
                    }
                    // Insert Work Done Entry
                    await runQuery("insert into monthlyworkdone set ?", [workDone]);
                    // Scenario 3 — Negative entry makes existing total to "0" then lock the line Item
                    if (qty < 0 && (totalExistingQty + qty === 0)) {
                        await runQuery("update monthlyworkdone set MovedToEstimate='Yes' where Job_ID=? and Item=? and idProject=?", [workDone.Job_ID, workDone.Item, workDone.idProject])
                        sendTostNotification(req.session.UserID, "Warning: The total quantity for this line item is 0. As a result, the corresponding line item code will be locked and cannot be moved to Estimates or Invoicing.", 'verified');
                        // return res.status(406).json("Warning: The total quantity for this line item is 0. As a result, the corresponding line item code will be locked and cannot be moved to Estimates or Invoicing.");
                    }
                }
                // If all inserts are successful
                sendTostNotification(req.session.UserID, "Work Done Added Successfully", "success");
                return res.status(200).json("Work Done Added Successfully");
            } catch (error) {
                console.log(error)
                sendTostNotification(req.session.UserID, "Failed to add Work Done", 'error');
                return res.status(501).json("Failed to add Work Done");
            }
        } else {
            return res.status(400).json("Unauthorized Request.")
        }
    })
    // Move WOrk Done to Estimates
    api_router.post("/moveWorkDoneToEstimate", async (req, res) => {
        if (req.session.UserID) {
            const { rows, selected, ReservedDate } = req.body;
            const selectedWDIds = selected.map(r => r.id);
            try {
                const promises = rows.map(async row => {
                    const { id, code, qty } = row;
                    const workdoneData = await runQuery("select * from monthlyworkdone where idmonthlyworkdone=? and Item=?", [id, code]);
                    if (workdoneData.length) {
                        let workdone = workdoneData[0];
                        delete workdone.idmonthlyworkdone;
                        delete workdone.WorkedMonth;
                        delete workdone.Created_Date;
                        delete workdone.Created_By;
                        delete workdone.Quantity;
                        delete workdone.MovedToEstimate;
                        delete workdone.isCredeted;
                        workdone.Status = "Pending";
                        // workdone.ApprovedDate = ReservedDate;
                        workdone.Quantity = qty;
                        workdone.Created_By = req.session.UserID;
                        workdone.Created_Date = getTimeStamp();
                        const result = await runQuery("insert into estimates set ?", [workdone])
                        return result;
                    } else {
                        return false;
                    }
                })

                const results = await Promise.all(promises);
                const successfulInserts = results.filter(result => result !== false);
                if (successfulInserts.length === rows.length) {
                    await runQuery("Update monthlyworkdone set MovedToEstimate='Yes' where idmonthlyworkdone in (?)", [selectedWDIds]);
                    req.session.Notifications = JSON.stringify(
                        new Notification(
                            "Success!",
                            "All estimates added successfully.",
                            "success",
                            "3s"
                        )
                    );
                    return res.status(200).send({ message: "All estimates added successfully.", count: successfulInserts.length });
                } else {
                    req.session.Notifications = JSON.stringify(
                        new Notification(
                            "Warning!",
                            "Some estimates could not be added.",
                            "warning",
                            "3s"
                        )
                    );
                    return res.status(206).send({ message: "Some estimates could not be added.", count: successfulInserts.length });
                }
            } catch (error) {
                console.log(error)
                req.session.Notifications = JSON.stringify(
                    new Notification(
                        "Error!",
                        "Internal Server Error.",
                        "error",
                        "3s"
                    )
                );
                return res.status(404).send("Internal Server Error.")
            }
        } else {
            return res.status(400).json("Unauthorized Request.")
        }
    })
    // add credit note
    api_router.post("/addCreditNote", uploadCreditNote.single("creditNoteFile"), async (req, res) => {
        if (req.session.UserID) {
            let data = req.body;
            const { creditNotePath } = data;
            data.creditNoteOn = getTimeStamp();
            data.creditNoteBy = req.session.UserID;
            const { Estimates_ID } = data;
            delete data.Estimates_ID;
            delete data.creditNoteFile;
            let serverFilePath = null;
            serverFilePath = creditNotePath ? creditNotePath : null;
            if (res.req.file) {
                serverFilePath = `/public/uploads/Credit_Notes/${res.req.file.filename}`;
            }
            data.creditNotePath = serverFilePath;
            // Ensure Estimates_ID is always an array
            const ids = Array.isArray(Estimates_ID) ? Estimates_ID : String(Estimates_ID).split(',').map(Number);
            try {
                const estimateDataArray = await runQuery("SELECT *,(Quantity*UnitPrice) as TotalValue FROM estimates where idestimates IN (?)", [ids]);
                // Validate Credit Note Date with All Line Items Invoiced Date
                const invalidEstimates = estimateDataArray.find(est => new Date(est['Invoiced Date']) > new Date(data.creditNoteDate))
                if (invalidEstimates) {
                    sendTostNotification(req.session.UserID, "Credit Note Date cannot be earlier than the Invoice Date.", 'error');
                    return res.status(406).json("Credit Note Date cannot be earlier than the Invoice Date.");

                }
                // const invdate = new Date(estimateData['Invoiced Date']);
                // if (invdate > new Date(data.creditNoteDate)) {
                //     sendTostNotification(req.session.UserID, "Credit Note Date cannot be earlier than the Invoice Date.", 'error');
                //     return res.status(406).json("Credit Note Date cannot be earlier than the Invoice Date.");
                // }
                // return res.status(500).json("Internal Server Error");

                data.Status = "Credit"
                let result = await runQuery("update estimates set ? where idestimates IN (?)", [data, ids])
                if (result.affectedRows > 0) {
                    // Upadte monthlyworkdone for each estimate
                    for (const est of estimateDataArray) {
                        await runQuery("update monthlyworkdone set isCredeted='Yes',MovedToEstimate='No' where Job_ID=? and Item=? and MovedToEstimate='Yes'", [est.Job_ID, est.Item])
                    }
                    sendTostNotification(req.session.UserID, "Credit Note Added Successfully.", 'success');
                    return res.status(200).json("Credit Note Added Successfully");
                } else {
                    sendTostNotification(req.session.UserID, "Failed to add Credit Note.", 'error');
                    return res.status(500).json("Failed to add Credit Note");
                }
            } catch (error) {
                console.log(error)
                sendTostNotification(req.session.UserID, "Internal Server Error.", 'error');
                return res.status(500).json("Internal Server Error");
            }
        } else {
            return res.status(400).json("Unauthorized Request.")
        }
    })
    function generateOTP(length = 6) {
        return Math.floor(10 ** (length - 1) + Math.random() * 9 * 10 ** (length - 1)).toString();
    }
    api_router.post("/Send-OTP/:Reason", async (req, res) => {
        if (req.session.UserID) {
            const { Reason } = req.params;
            const { UserID } = req.session;
            const otp = generateOTP();
            const ttl = 5 * 60 * 1000; // 5 minutes
            const expiresAt = Date.now() + ttl;
            // Store in session
            req.session.otpData = { UserID, otp, expiresAt };
            if (Reason == "CreditNote") {
                const { InvoiceNumber, creditNoteNumber, creditNoteDate } = req.body;
                console.log(`OTP for ${UserID}: ${otp}`);
                const ids = Array.isArray(creditNoteNumber) ? creditNoteNumber : [creditNoteNumber];
                const estimateDataArray = await runQuery("SELECT *,(Quantity*UnitPrice) as TotalValue FROM estimates where idestimates IN (?)", [ids]);
                // Validate Credit Note Date with All Line Items Invoiced Date
                const invalidEstimates = estimateDataArray.find(est => new Date(est['Invoiced Date']) > new Date(creditNoteDate))
                if (invalidEstimates) {
                    sendTostNotification(req.session.UserID, "Credit Note Date cannot be earlier than the Invoice Date.", 'error');
                    return res.status(406).json("Credit Note Date cannot be earlier than the Invoice Date.");
                }
                const UserData = await runQuery("Select * from users where Status='Active' and Employee_ID=?", [req.session.UserID])
                await SendEmail(UserData[0].Email_ID, "ajith.venkatesh@quadgenwireless.com", `Your One-Time Password (OTP) for Raising Credit Note - ${InvoiceNumber}`,
                    // await SendEmail("ajith.venkatesh@quadgenwireless.com", "ajith.venkatesh@quadgenwireless.com", `Your One-Time Password (OTP) for Raising Credit Note - ${InvoiceNumber}`,
                    `<h4>Your One-Time Password (OTP) for Raising Credit Note - ${InvoiceNumber}</H4>
                    <h1>${otp}</h1>
                                  <p>
                This OTP is valid for <strong>5 minutes</strong>.  
                Please do not share this code with anyone.
              </p>

              <p>
                If you did not request this verification, you can safely ignore this email.
              </p>
                    `)
                sendTostNotification(req.session.UserID, "We have sent a One-Time Password (OTP) to your email. Please check your inbox to continue.", 'success');
                res.json({ message: 'OTP sent' });
            }
        } else {
            return res.status(400).json("Unauthorized Request.")
        }
    })

    api_router.post("/Verify-OTP/:Reason", async (req, res) => {
        if (req.session.UserID) {
            const { OTP } = req.body;
            if (!req.session.otpData) {
                sendTostNotification(req.session.UserID, "OTP Not Found.", 'error');
                return res.status(400).json({ success: false, message: 'OTP not found' });
            }
            const { otp: sessionOtp, expiresAt } = req.session.otpData;
            if (Date.now() > expiresAt) {
                delete req.session.otpData;
                sendTostNotification(req.session.UserID, "OTP Expired.", 'error');
                return res.status(400).json({ success: false, message: 'OTP expired' });
            }
            if (OTP !== sessionOtp) {
                sendTostNotification(req.session.UserID, "Invalid OTP.", 'error');
                return res.status(400).json({ success: false, message: 'Invalid OTP' });
            }
            // Valid OTP
            delete req.session.otpData;
            sendTostNotification(req.session.UserID, "OTP verified.", 'success');
            return res.json({ success: true, message: 'OTP verified' });
        } else {
            return res.status(400).json("Unauthorized Request.")
        }
    })

    // Get Invoice details to verify the date
    api_router.get("/getEstimateDetails", async (req, res) => {
        const { Estimates_ID } = req.query;
        const ids = Array.isArray(Estimates_ID) ? Estimates_ID : String(Estimates_ID).split(',').map(Number);
        const estimateData = await runQuery("select *,(Quantity*UnitPrice) as TotalValue from estimates where idestimates IN (?)", [ids]);
        if (estimateData.length) {
            return res.status(200).json(estimateData);
        }
        return res.status(204).send("No Content")
    })
    api_router.get("/getInvoice", async (req, res) => {
        const { invNo } = req.query;
        const invDetails = await runQuery('select DATE_FORMAT(`Invoiced Date`,"%Y-%m-%d") as invDate,invoicePath from estimates where `Invoice Number`=? and `Invoiced Date` is not null order by idestimates asc limit 1', [invNo])
        if (invDetails.length) {
            const invDate = invDetails[0]['invDate'];
            const invoicePath = invDetails[0]['invoicePath'];
            return res.status(200).send({ invDate: invDate, invoicePath: invoicePath })
        } else {
            return res.status(204).send("No Content")
        }
    })

    api_router.get("/getCreditNote", async (req, res) => {
        const { creditNoteNo } = req.query;
        const creditNoteDetails = await runQuery('select DATE_FORMAT(`creditNoteDate`,"%Y-%m-%d") as creditNoteDate,creditNotePath,creditNoteReason from estimates where `creditNoteNumber`=? and `creditNoteDate` is not null order by idestimates asc limit 1', [creditNoteNo])
        if (creditNoteDetails.length) {
            const creditNoteDate = creditNoteDetails[0]['creditNoteDate'];
            const creditNotePath = creditNoteDetails[0]['creditNotePath'];
            const creditNoteReason = creditNoteDetails[0]['creditNoteReason'];
            return res.status(200).send({ creditNoteDate: creditNoteDate, creditNotePath: creditNotePath, creditNoteReason: creditNoteReason })
        } else {
            return res.status(204).send("No Content")
        }
    })
    //End point for React API
    const JWT_SECRET = "Poda Venna"
    // Middleware to validate token
    function authenticateToken(req, res, next) {
        const authHeader = req.headers["authorization"];
        if (!authHeader?.startsWith("Bearer ")) {
            return res.status(401).json({ message: "Unauthorized Request" }) // No token provided
        }
        const token = authHeader.split(" ")[1];
        if (!token) return res.sendStatus(401);
        try {
            jwt.verify(token, JWT_SECRET, (err, user) => {
                console.log(err)
                if (err) return res.sendStatus(403);
                req.user = user;
                next();
            });
        } catch (error) {
            console.log(error)
            return res.status(500).json({ message: "Internal Server Error" });

        }
    }
    api_router.post('/login', (req, res) => {
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
                        const user = result[0];
                        const token = jwt.sign({ id: user.Employee_ID, role: user.Role, username: user.Full_Name }, JWT_SECRET, { expiresIn: "1h" });
                        res.cookie('token', token, { httpOnly: true })
                        res.json({ token, user: { id: user.Employee_ID, username: user.Full_Name, role: user.Role } });
                    } else {
                        const temp = new Notification('Error..!', 'Incorrect Password', 'error', '2s');
                        req.session.Notifications = JSON.stringify(temp);
                        return res.status(401).json({ message: "Invalid credentials" });
                    }
                }).catch(err => {
                    console.log(err);
                })
            } else {
                const temp = new Notification('Error..!', 'Incorrect Employee-ID', 'error', '2s');
                req.session.Notifications = JSON.stringify(temp);
                return res.status(401).json({ message: "Invalid User Name" });
            }
        })
    });
    api_router.get("/getTasks/:ID", authenticateToken, async (req, res) => {
        const { ID } = req.params;
        if (!ID) {
            return res.status(400).json({ message: "Invalid Request" });
        }
        try {
            const tasks = await runQuery("select T.*,date_format(DueDate,'%c/%d/%y') as DueDate,DATE_FORMAT(DueDate,'%Y/%c/%d') as n_DueDate, date_format(StartDate,'%c/%d/%y') as StartDate,date_format(EndDate,'%c/%d/%y') as EndDate,users.Full_Name from task  as T left join users on users.Employee_ID=T.Owner where T.TaskName=?", [ID]);
            if (tasks.length > 0) {
                return res.status(200).json(tasks);
            } else {
                return res.status(404).json({ message: "No tasks found for this project." });
            }
        } catch (error) {
            console.error("Error fetching tasks:", error);
            return res.status(500).json({ message: "Internal Server Error" });
        }

    })
    api_router.get("/getSubtasks/:ID", authenticateToken, async (req, res) => {
        const { ID } = req.params;
        console.log(ID)
        if (!ID) {
            return res.status(400).json({ message: "Invalid Request" });
        }
        try {
            const subTask = await runQuery("select subtask.*,DATE_FORMAT(EndDate,'%c/%d/%y') as EndDate,DATE_FORMAT(StartDate,'%c/%d/%y') as StartDate,DATE_FORMAT(Due_Date,'%c/%d/%y') as DueDate,DATE_FORMAT(Due_Date,'%Y-%m-%d') as f_DueDate,DATE_FORMAT(EndDate,'%Y-%m-%d') as f_EndDate,users.Full_Name from subtask inner join users on users.Employee_ID=subtask.Owner where Task_Name=?", [ID]);
            if (subTask.length > 0) {
                return res.status(200).json(subTask);
            } else {
                return res.status(404).json({ message: "No Subtask found for this Task." });
            }
        } catch (error) {
            console.error("Error fetching tasks:", error);
            return res.status(500).json({ message: "Internal Server Error" });
        }

    })
    api_router.get("/getMarkups/:ID", authenticateToken, async (req, res) => {
        const { ID } = req.params;
        console.log(ID)
        if (!ID) {
            return res.status(400).json({ message: "Invalid Request" });
        }
        try {
            const markup = await runQuery("select markup.*,DATE_FORMAT(EndDate,'%c/%d/%y') as EndDate,DATE_FORMAT(DueDate,'%c/%d/%y') as DueDate,DATE_FORMAT(StartDate,'%c/%d/%y') as StartDate,DATE_FORMAT(DueDate,'%Y-%m-%d') as f_DueDate,DATE_FORMAT(EndDate,'%Y-%m-%d') as f_EndDate,users.Full_Name from markup inner join users on users.Employee_ID=markup.Owner where Task_Name=?", [ID]);
            if (markup.length > 0) {
                return res.status(200).json(markup);
            } else {
                return res.status(404).json({ message: "No Markup found for this Task." });
            }
        } catch (error) {
            console.error("Error fetching tasks:", error);
            return res.status(500).json({ message: "Internal Server Error" });
        }

    })
    api_router.get("/getTimeSheet/:ID", authenticateToken, async (req, res) => {
        const { ID } = req.params;
        console.log(ID)
        if (!ID) {
            return res.status(400).json({ message: "Invalid Request" });
        }
        try {
            const log = await runQuery("select U.Full_Name,T.*,DATE_FORMAT(T.startTime,'%c-%d-%y %T') as startTime,DATE_FORMAT(T.endTime,'%c-%d-%y %T') as endTime from timesheet as T inner join users as U on T.UserID=U.Employee_ID where TaskName=?;", [ID]);
            if (log.length > 0) {
                return res.status(200).json(log);
            } else {
                return res.status(404).json({ message: "No Time Log found for this Task." });
            }
        } catch (error) {
            console.error("Error fetching tasks:", error);
            return res.status(500).json({ message: "Internal Server Error" });
        }

    })
    api_router.get("/getProjects", authenticateToken, async (req, res) => {
        try {
            const projects = await runQuery(`select users.Full_Name,P.*,DATE_FORMAT(ReceivedDate,'%c/%d/%y') as n_ReceivedDate,DATE_FORMAT(SubmittedDate,'%c/%d/%y') as n_SubmittedDate, DATE_FORMAT(DueDate,'%c/%d/%y') as n_DueDate,DATE_FORMAT(ApprovedDate,'%c/%d/%y') as n_ApprovedDate,DATE_FORMAT(DueDate,'%Y-%m-%d') as f_DueDate,DATE_FORMAT(SubmittedDate,'%Y-%m-%d') as f_SubmittedDate,DATE_FORMAT(ApprovedDate,'%Y-%m-%d') as f_ApprovedDate from atx as P inner join users on users.Employee_ID=P.Owner`);
            if (projects.length > 0) {
                return res.status(200).json(projects);
            } else {
                return res.status(404).json({ message: "No Projects found for this customer." });
            }
        } catch (error) {
            console.error("Error fetching tasks:", error);
            return res.status(500).json({ message: "Internal Server Error" });
        }

    })
    api_router.get("/getPaymentDetails", async (req, res) => {
    if (!req.session.UserID) {
        return res.status(401).json({ message: "Unauthorized Request" });
    }
    const { Estimates_ID } = req.query;
    const ids = Array.isArray(Estimates_ID) ? Estimates_ID : String(Estimates_ID).split(',').map(Number);
    try {
        const payments = await runQuery(
            `SELECT 
                \`Invoice Number\` as Invoice_Number,
                \`Amount Received\` as Amount_Received,
                DATE_FORMAT(\`Payment Received Date\`, '%m/%d/%Y') as Payment_Received_Date,
                invoicePath,
                isPartialPayment as Remark
            FROM estimates 
            WHERE idestimates IN (?) 
            AND Status = 'Payment Received'
            ORDER BY idestimates ASC`,
            [ids]
        );
        if (payments.length) {
            return res.status(200).json(payments);
        }
        return res.status(204).json([]);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
});
    api_router.get("*", (req, res) => {
        res.send("Invalid API Request")
    })
    return api_router;
}
// module.exports = api_router