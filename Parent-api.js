var express = require('express')
const router = express.Router();
require('dotenv').config();


const path = require("path");
const iconv = require('iconv-lite');
const { google } = require("googleapis");
const multer = require("multer"); // import multer ก่อน stream
const stream = require("stream"); // import stream หลังจาก multer
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const { Mutex } = require('async-mutex');
const mutex = new Mutex();

// const { v4: uuidv4 } = require('uuid');
// const fs = require('fs');
// // get the client
// const mysql = require('mysql2');
// const connection = mysql.createConnection({
//     host: process.env.HOST,
//     user: process.env.USER,
//     database: process.env.DATABASE,
//     password: process.env.PASSWORD,
//     port: process.env.PORT_DB,
//     ssl: {ca: fs.readFileSync(path.join(__dirname, process.env.SSL))}
//   });

// connection.connect((err) => {
//   if((err)) {
//     console.log('Error connecting to MySQL database =', err)
//     return;
//   }
//   console.log('MySQL successfully connected!');
// })

module.exports = function(connection) {

// CREATE Routes
router.post("/register", async (req, res) => {
//   const { Email, Password } = req.body;

  const data = req.body;

    if (!Array.isArray(data)) {
        return res.status(400).json({ error: "Invalid request body. Expecting an array of data." });
    }

    try {
        const values = data.map(item => [
            item.Email,
            item.Password
        ]);

      connection.query(
          "INSERT INTO parent_login(Email, Password) VALUES ?",
          [values],
          (err, results, fields) => {
              if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    // Duplicate entry error
                    return res.status(409).json({ error: "Email already exists. You are already registered." });
                } else {
                  console.log("Error while inserting a user into the database", err);
                  return res.status(400).json({ error: err.message });
                }
              }
              return res.status(201).json({ message: "New user successfully created!"});
          }
      )
  } catch(err) {
      console.log(err);
      return res.status(500).send();
  }
})

//คิวรี่ข้อมูลของคนที่ล็อคอินอยู่มาแสดง
router.get("/user_information/:Email", async (req, res) => {
    const Email = req.params.Email;

    try {
        connection.query(
            "SELECT Avatar, FirstName, LastName, Email FROM Parent WHERE Email = ?",
            [Email],
            (err, results, fields) => {
                if (err) {
                    console.log(err);
                    return res.status(400).json({ error: err.message });
                }
                res.status(200).json(results);
            }
        );
    } catch (err) {
        console.log(err);
        return res.status(500).send();
    }
});


const KEYFILEPATH = path.join(__dirname, "school-project-ggDrive.json");
const SCOPES = ["https://www.googleapis.com/auth/drive"];

const auth = new google.auth.GoogleAuth({
    keyFile: KEYFILEPATH,
    scopes: SCOPES,
});

router.post("/upload", upload.any(), async (req, res) => {
    try {
            console.log("req.body", req.body);
            console.log("req.files", req.files);
            const { body, files } = req;

            // ดึงข้อมูลนักเรียนที่ส่งมาจากฟอร์ม
            const { Student_NID, NameTitle, FirstName, LastName, Student_DOB, Transcript_type, ParentEmail, HouseNumber, Moo, Soi, Road, Province, District, SubDistrict } = body;

            console.log("files",files);

            const transcriptFilesUrls = [];
            // อัปโหลดไฟล์ที่ส่งมาไปยัง Google Drive
            for (let f = 0; f < files.length; f += 1) {
                const data = await uploadFile(files[f]);
                transcriptFilesUrls.push(`https://drive.google.com/file/d/${data.id}`);
            }

            // ตรวจสอบว่ามี URL ของไฟล์ที่อัปโหลดพอสำหรับการเข้าถึงหรือไม่
            if (transcriptFilesUrls.length >= 4) {
                // เรียกใช้งานฟังก์ชันเพื่อเพิ่มข้อมูลลงในฐานข้อมูล
                await addApplicantToDatabase(Student_NID, NameTitle, FirstName, LastName, Student_DOB, transcriptFilesUrls[0], HouseNumber, Moo, Soi, Road, Province, District, SubDistrict, Transcript_type, transcriptFilesUrls[1], transcriptFilesUrls[2], transcriptFilesUrls[3], ParentEmail);
                res.status(200).send("Form Submitted");
            } else {
                // จัดการข้อผิดพลาดหาก URL ของไฟล์ไม่เพียงพอ
                console.error("Not enough transcript file URLs for accessing.");
                // ส่งคำตอบเฉพาะข้อผิดพลาดกลับไป
                res.status(500).json({ error: "Not enough transcript file URLs for accessing." });
            }

            // อัปโหลดไฟล์ที่ส่งมาไปยัง Google Drive
            // for (let f = 0; f < files.length; f += 1)
            // {
            //     // await uploadFile(files[f]);
            //     const data = await uploadFile(files[f]);

            // }

            // res.status(200).send("Form Submitted");

            // const Transcript_file = `https://drive.google.com/file/d/${data.id}`;


            // เพิ่มข้อมูลนักเรียนลงในฐานข้อมูล
            // await addApplicantToDatabase(Student_NID, NameTitle, FirstName, LastName, Student_DOB, transcriptFilesUrls[0], House_No, Moo, Soi, Road, Province, District, Sub_District, Transcript_type, transcriptFilesUrls[1], transcriptFilesUrls[2], HouseReg_file, ParentEmail);
            // res.status(200).send("Form Submitted");
        }   
        catch (error) {
            if (error.status && error.message) {
                return res.status(error.status).json({ error: error.message });
            } else {
                console.error(error);
                return res.status(500).send();
            }
        }
    });

const uploadFile = async (fileObject) => {
    const bufferStream = new stream.PassThrough();
    bufferStream.end(fileObject.buffer);
    // ใช้ iconv-lite ในการ decode ชื่อไฟล์
    const originalFilename = iconv.decode(Buffer.from(fileObject.originalname, 'binary'), 'utf-8');
    console.log('originalFilename', originalFilename);
    const { data } = await google.drive({ version: "v3", auth }).files.create({
        media: {
            mimeType: fileObject.mimeType,
            body: bufferStream,
        },
        requestBody: {
            name: originalFilename,
            parents: [process.env.PARENT],
        },
        fields: "id,name",
    });
    console.log(`Uploaded file ${data.name} ${data.id}`);
    console.log(`https://drive.google.com/file/d/${data.id}`);
    return data;
};

const addApplicantToDatabase = async (Student_NID, NameTitle, FirstName, LastName, Student_DOB, Avatar, House_No, Moo, Soi, Road, Province, District, Sub_District, Transcript_type, Transcript_file, BirthCert_file, HouseReg_file, ParentEmail) => {
    return new Promise((resolve, reject) => {
        connection.query(
            "INSERT INTO Applicant (Student_NID, NameTitle, FirstName, LastName, Student_DOB, Avatar, House_No, Moo, Soi, Road, Province, District, Sub_District, Transcript_type, Transcript_file, BirthCert_file, HouseReg_file, ParentEmail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [Student_NID, NameTitle, FirstName, LastName, Student_DOB, Avatar, House_No, Moo, Soi, Road, Province, District, Sub_District, Transcript_type, Transcript_file, BirthCert_file, HouseReg_file, ParentEmail],
            (err, results, fields) => {
                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') {
                        reject({ status: 409, message: "Identification number already exists." });
                    } else {
                        console.log("Error while inserting student information into the database", err);
                        reject({ status: 400, message: err.message });
                    }
                } else {
                    resolve({ status: 200, message: "Student information successfully recorded!" });
                }
            }
        );
    });
};

router.post("/upload-student-img-request", upload.any(), async (req, res) => {
    try {
            console.log("req.body", req.body);
            console.log("req.files", req.files);
            const { body, files } = req;

            // ดึงข้อมูลนักเรียนที่ส่งมาจากฟอร์ม
            // const { Student_ID, Parent_Email, Request_Date, Request_type, Requested_Copies, Request_detail, Request_status } = body;
            const { CheckRequestStudent, CheckRequestTranscript, Student_ID, Parent_Email, Request_Date, AmountRequestStudent, AmountRequestTranscript, Request_detail, Request_status } = body;

            console.log("files",files);

            const requestFilesUrls = [];
            // อัปโหลดไฟล์ที่ส่งมาไปยัง Google Drive
            for (let f = 0; f < files.length; f += 1) {
                const data = await uploadFile(files[f]);
                requestFilesUrls.push(`https://drive.google.com/file/d/${data.id}`);
            }

            console.log("requestFilesUrls",requestFilesUrls);
            // ตรวจสอบว่ามี URL ของไฟล์ที่อัปโหลดพอสำหรับการเข้าถึงหรือไม่
            console.log("111111",AmountRequestStudent);
            console.log("2222222",AmountRequestTranscript);
            if (requestFilesUrls.length >= 1) {
                try {
                    // await addRequestToDatabase(Student_ID, Parent_Email, Request_Date, Request_type, Requested_Copies, Request_detail, requestFilesUrls[0], Request_status);
                    console.log("777777777",CheckRequestStudent);
                    if(CheckRequestStudent === "true"){
                        console.log("555555555",AmountRequestTranscript);
                        await addRequestToDatabase(Student_ID, Parent_Email, Request_Date, 'ปพ.7', AmountRequestStudent, Request_detail, requestFilesUrls[0], Request_status);
                    }

                    if(CheckRequestTranscript === "true"){
                        await addRequestToDatabase(Student_ID, Parent_Email, Request_Date, 'ปพ.1', AmountRequestTranscript, Request_detail, requestFilesUrls[0], Request_status);
                    }
                    
                    res.status(200).send("Form Submitted");
                } catch (error) {
                    console.error(error);
                    res.status(500).json({ error: "Failed to save request information" });
                }
            } else {
                console.error("Not enough transcript file URLs for accessing.");
                res.status(500).json({ error: "Not enough transcript file URLs for accessing." });
            }
            
        }   
        catch (error) {
            if (error.status && error.message) {
                return res.status(error.status).json({ error: error.message });
            } else {
                console.error(error);
                return res.status(500).send();
            }
        }
    });

    const addRequestToDatabase = async (Student_ID, Parent_Email, Request_Date, Request_type, Requested_Copies, Request_detail, Request_StudentPicture, Request_status) => {
        const sql = `
            INSERT INTO Request (Student_ID, Parent_Email, Request_Date, Request_type, Requested_Copies, Request_detail, Request_StudentPicture, Request_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
    
        connection.query(sql, [Student_ID, Parent_Email, Request_Date, Request_type, Requested_Copies, Request_detail, Request_StudentPicture, Request_status], (err, results) => {
            if (err) {
                console.error('Error saving request information:', err);
                // ไม่ต้องส่งคำตอบกลับในที่นี้
                // res.status(500).json({ error: 'Failed to save request information' });
            }
    
            // ไม่ต้องส่งคำตอบกลับในที่นี้
            // res.status(200).json({ message: 'Request information saved successfully' });
        });
    };
    
    
    

router.get('/check-email', (req, res) => {
    const { email } = req.query;
    console.log(email);
    // const email = "parent3@example.com";
    
    // สร้าง query SQL เพื่อค้นหาอีเมลในฐานข้อมูล
    const query = 'SELECT * FROM parent WHERE Email = ?';
    
    // ส่ง query ไปยังฐานข้อมูล
    connection.query(query, [email], (err, results) => {
        if (err) {
        console.error('Error querying database:', err);
        return res.status(500).json({ error: 'Database error' });
        }
    
        // ตรวจสอบว่ามีผลลัพธ์จาก query หรือไม่
        if (results.length > 0) {
        // พบอีเมลในฐานข้อมูล
        // res.json({ results: results });
        res.json({ results });
        // res.json({ found: true });
        } else {
        // ไม่พบอีเมลในฐานข้อมูล
        res.json({ found: false });
        }
    });
    });

//   router.get('/check-email', (req, res) => {
//     const { email, role } = req.query;
//     console.log(email);
//     // const email = "parent3@example.com";

//     // สร้าง query SQL เพื่อค้นหาอีเมลในฐานข้อมูลโดยมีเงื่อนไข role
//     const query = 'SELECT * FROM parent WHERE Email = ? AND Role = ?';
    
//     // ส่ง query ไปยังฐานข้อมูล
//     connection.query(query, [email, role], (err, results) => {
//       if (err) {
//         console.error('Error querying database:', err);
//         return res.status(500).json({ error: 'Database error' });
//       }

//       // ตรวจสอบว่ามีผลลัพธ์จาก query หรือไม่
//       if (results.length > 0) {
//         // พบอีเมลในฐานข้อมูล
//         res.json({ found: true });
//       } else {
//         // ไม่พบอีเมลในฐานข้อมูล
//         res.json({ found: false });
//       }
//     });
// });


//นำข้อมูลผู้สมัครลงฐานข้อมูล
router.post("/NewStudent_information", async (req, res) => {
    const { 
        Applicant_ID, 
        Student_NID, 
        NameTitle, 
        FirstName, 
        LastName, 
        Student_DOB, 
        Avatar, 
        House_No,
        Moo,
        Soi,
        Road,
        Province,
        District,
        Sub_District,
        Transcript_type, 
        Transcript_file, 
        BirthCert_file, 
        HouseReg_file,
        ParentEmail 
    } = req.body;

    try {
        connection.query(
            "INSERT INTO Applicant (Applicant_ID, Student_NID, NameTitle, FirstName, LastName, Student_DOB, Avatar, House_No, Moo, Soi, Road, Province, District, Sub_District, Transcript_type, Transcript_file, BirthCert_file, HouseReg_file, ParentEmail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [Applicant_ID, Student_NID, NameTitle, FirstName, LastName, Student_DOB, Avatar, House_No, Moo, Soi, Road, Province, District, Sub_District, Transcript_type, Transcript_file, BirthCert_file, HouseReg_file, ParentEmail],
            (err, results, fields) => {
                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') {
                        return res.status(409).json({ error: "Identification number already exists." });
                    } else {
                        console.log("Error while inserting student information into the database", err);
                        return res.status(400).json({ error: err.message });
                    }
                }
                return res.status(200).json({ message: "Student information successfully recorded!" });
            }
        );
    } catch (err) {
        console.log(err);
        return res.status(500).send();
    }
});

// app.post("/NewStudent_information", async (req, res) => {
//     const { 
//         Applicant_ID, 
//         Student_NID, 
//         NameTitle, 
//         FirstName, 
//         LastName, 
//         Student_DOB, 
//         Avatar, 
//         ParentEmail, 
//         Transcript_type, 
//         Transcript_file, 
//         BirthCert_file, 
//         HouseReg_file 
//     } = req.body;

//     try {
//         connection.query(
//             "INSERT INTO Applicant (Applicant_ID, Student_NID, NameTitle, FirstName, LastName, Student_DOB, Avatar, ParentEmail, Transcript_type, Transcript_file, BirthCert_file, HouseReg_file) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
//             [Applicant_ID, Student_NID, NameTitle, FirstName, LastName, Student_DOB, Avatar, ParentEmail, Transcript_type, Transcript_file, BirthCert_file, HouseReg_file],
//             (err, results, fields) => {
//                 if (err) {
//                     if (err.code === 'ER_DUP_ENTRY') {
//                         return res.status(409).json({ error: "Identification number already exists." });
//                     } else {
//                         console.log("Error while inserting student information into the database", err);
//                         return res.status(400).json({ error: err.message });
//                     }
//                 }
//                 return res.status(201).json({ message: "Student information successfully recorded!" });
//             }
//         );
//     } catch (err) {
//         console.log(err);
//         return res.status(500).send();
//     }
// });

// กำหนดเลข Applicant_ID ของผู้สมัคร จาก Student_NID
router.patch("/Define_Applicant_ID/:Student_NID", async (req, res) => {
    const Student_NID = req.params.Student_NID;
    const applicant_ID = req.body.applicant_ID;

    try {
        // เพิ่มเงื่อนไขสำหรับตรวจสอบว่ามี Student_NID ที่กำหนดหรือไม่
        connection.query("SELECT * FROM applicant WHERE Student_NID = ?", [Student_NID], (selectErr, selectResults, selectFields) => {
            if (selectErr) {
                console.log("Error while checking Student_NID in the database", selectErr);
                return res.status(500).json({ error: selectErr.message });
            }

            // ถ้าไม่พบ Student_NID
            if (selectResults.length === 0) {
                return res.status(404).json({ error: "Student with the provided ID not found." });
            }

            // ถ้าพบ Student_NID, ทำการอัปเดตข้อมูล
            connection.query("UPDATE applicant SET applicant_ID = ? WHERE Student_NID = ?", [applicant_ID, Student_NID], (err, results, fields) => {
                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') {
                        return res.status(409).json({ error: "applicant id already exists." });
                    } else {
                        console.log("Error while updating student information in the database", err);
                        return res.status(400).json({ error: err.message });
                    }
                }
                return res.status(200).json({ message: "Student information successfully updated!" });
            });
        });
    } catch (err) {
        console.log(err);
        return res.status(500).send();
    }
});

router.post('/add-parent-login', (req, res) => {
    const { Avatar, Email, Token } = req.body;
    
    try {
        const query =  'INSERT INTO Parent_Login (Avatar, Email, Token) VALUES (?, ?, ?)';
        connection.query(query, [Avatar, Email, Token], (err, result) => {
            if (err) {
                console.error('Error adding parent login:', err);
                if (err.code === 'ER_DUP_ENTRY') {
                    // Duplicate entry error
                    return res.status(409).json({ error: "Email already exists." });
                } else {
                    // Other database error
                    return res.status(400).json({ error: 'An error occurred while adding parent login' });
                }
            }
            return res.status(200).json({ message: 'Parent login created successfully' });
        });
    } catch (error) {
        console.error('Error adding parent login:', error);
        return res.status(500).json({ error: 'Failed to add parent login' });
    }
});


//นำข้อมูลของผู้ปกครองผู้สมัครลงฐานข้อมูล
router.post("/Parent_information", async (req, res) => {
    const data = req.body;

    if (!Array.isArray(data)) {
        return res.status(400).json({ error: "Invalid request body. Expecting an array of data." });
    }

    try {
        const values = data.map(item => [
            item.Avatar,
            item.Email,
            item.FirstName,
            item.LastName,
            item.DateOfBirth,
            item.Nationality,
            item.Office,
            item.Occupation,
            item.Role,
            item.Tel
        ]);

        connection.query(
            "INSERT INTO Parent (Avatar, Email, FirstName, LastName, DateOfBirth, Nationality, Office, Occupation, Role, Tel) VALUES ?",
            [values],
            (err, results, fields) => {
                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') {
                        // Duplicate entry error
                        return res.status(409).json({ error: "Email already exists." });
                    } else {
                        console.log("Error while inserting parent information into the database", err);
                        return res.status(400).json({ error: err.message });
                    }
                }
                return res.status(200).json({ message: "Parent information successfully recorded!" });
            }
        );
    } catch (err) {
        console.log(err);
        return res.status(500).send();
    }
});

//นำข้อมูลทะเบียนบ้านของผู้สมัครลงฐานข้อมูล
router.post("/Household_information", async (req, res) => {
    const { 
        Applicant_ID,
        House_No,
        Moo,
        Soi,
        Road,
        Province,
        District,
        Sub_District
    } = req.body;

    try {
        connection.query(
            "INSERT INTO Household (Applicant_ID, House_No, Moo, Soi, Road, Province, District, Sub_District) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [Applicant_ID, House_No, Moo, Soi, Road, Province, District, Sub_District],
            (err, results, fields) => {
                if (err) {
                    console.log("Error while inserting household information into the database", err);
                    return res.status(400).json({ error: err.message });
                }
                return res.status(201).json({ message: "Household information successfully recorded!" });
            }
        );
    } catch (err) {
        console.log(err);
        return res.status(500).send();
    }
});

// router.post('/add-parent-emails', (req, res) => {
//     const { Student_NID, first_ParentEmail, second_ParentEmail, third_ParentEmail } = req.body;

//     const query = 'INSERT INTO Applicant_ParentEmail (Student_NID, first_ParentEmail, second_ParentEmail, third_ParentEmail) VALUES (?, ?, ?, ?)';
    
//     connection.query(query, [Student_NID, first_ParentEmail, second_ParentEmail, third_ParentEmail], (err, results) => {
//         if (err) {
//             if (err.code === 'ER_DUP_ENTRY') {
//                 // Duplicate entry error
//                 return res.status(409).json({ error: "Email already exists." });
//             }
//             else{
//                 console.error('Error adding parent emails:', err);
//                 return res.status(500).json({ error: 'Failed to add parent emails' });
//             }
//         }
//         return res.status(200).json({ message: 'Parent emails added successfully' });
//     });
// });

router.post('/add-parent-emails', (req, res) => {
    const { Student_NID, first_ParentEmail, second_ParentEmail, third_ParentEmail } = req.body;

    try {
        const query = 'INSERT INTO Applicant_ParentEmail (Student_NID, first_ParentEmail, second_ParentEmail, third_ParentEmail) VALUES (?, ?, ?, ?)';

        connection.query(query, [Student_NID, first_ParentEmail, second_ParentEmail, third_ParentEmail], (err, results) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    // Duplicate entry error
                    return res.status(409).json({ error: "Email already exists." });
                } else {
                    console.error('Error adding parent emails:', err);
                    return res.status(400).json({ error: 'Failed to add parent emails' });
                }
            }
            return res.status(200).json({ message: 'Parent emails added successfully' });
        });
    } catch (error) {
        console.error('Error adding parent emails:', error);
        return res.status(500).json({ error: 'Failed to add parent emails' });
    }
});

router.get('/check-student-enrollment', (req, res) => {
    const { Student_NID, Enroll_Year, Enroll_Course } = req.query;
    const sql = `SELECT * FROM Enrollment WHERE Student_NID = ? AND Enroll_Year = ? AND Enroll_Course = ?`;
  
    connection.query(sql, [Student_NID, Enroll_Year, Enroll_Course], (err, results) => {
      if (err) {
        console.error('Error retrieving enrollment data:', err);
        res.status(500).json({ error: 'An error occurred while retrieving enrollment data' });
      } else {
        res.status(200).json(results);
      }
    });
});

router.post('/enrollment', (req, res) => {
    try {
        const { Student_NID, Enroll_Date, Enroll_Year, Enroll_Course, Enroll_Status } = req.body;

        const query = 'INSERT INTO Enrollment (Student_NID, Enroll_Date, Enroll_Year, Enroll_Course, Enroll_Status) VALUES (?, ?, ?, ?, ?)';

        connection.query(query, [Student_NID, Enroll_Date, Enroll_Year, Enroll_Course, Enroll_Status], (err, results) => {
            if (err) {
                console.error('Error adding enrollment:', err);
                return res.status(400).json({ error: 'Failed to add enrollment' });
            }
            return res.status(200).json({ message: 'Enrollment added successfully' });
        });
    } catch (error) {
        console.error('Error adding enrollment:', error);
        return res.status(500).json({ error: 'Failed to add enrollment' });
    }
});

// router.get('/get-student-info', (req, res) => {
//     const { studentId } = req.query;

//     const sql = `
//         SELECT Student_ID, FirstName, LastName
//         FROM Student
//         WHERE Student_ID = ?
//     `;

//     connection.query(sql, [studentId], (err, results) => {
//         if (err) {
//             console.error('Error querying student information:', err);
//             return res.status(500).json({ error: 'Failed to retrieve student information' });
//         }

//         if (results.length === 0) {
//             return res.status(404).json({ error: 'Student not found' });
//         }

//         const studentInfo = results[0];
//         return res.status(200).json(studentInfo);
//     });
// });

router.get('/get-student-id', (req, res) => {
    const { email } = req.query;

    const sql = `
        SELECT Student_ID 
        FROM Student_ParentEmail 
        WHERE first_ParentEmail = ? OR second_ParentEmail = ? OR third_ParentEmail = ?
    `;

    connection.query(sql, [email, email, email], (err, results) => {
        if (err) {
            console.error('Error retrieving student ID:', err);
            return res.status(500).json({ error: 'Failed to retrieve student ID' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Student ID not found for the provided email' });
        }

        const studentID = results.map(result => result.Student_ID);
        // const studentID = results[0].Student_ID;
        return res.status(200).json({ Student_ID: studentID });
    });
});

router.get('/get-student-info', (req, res) => {
    const { studentIds } = req.query;

    // แปลง studentIds จาก string เป็น array โดยใช้ split(',')
    const studentIdArray = studentIds.split(',');

    const sql = `
        SELECT Student_ID, FirstName, LastName
        FROM Student
        WHERE Student_ID IN (?)
    `;

    connection.query(sql, [studentIdArray], (err, results) => {
        if (err) {
            console.error('Error querying student information:', err);
            return res.status(500).json({ error: 'Failed to retrieve student information' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Students not found' });
        }

        return res.status(200).json(results);
    });
});

router.get('/get-all-request', (req, res) => {
    const { Parent_Email, Student_ID } = req.query;

    const sql = `
        SELECT Request_No, Request_Date, Request_type, Request_detail, Request_status 
        FROM Request 
        WHERE Parent_Email = ? AND Student_ID = ?
    `;

    connection.query(sql, [Parent_Email, Student_ID], (err, results) => {
        if (err) {
            console.error('Error querying request information:', err);
            return res.status(500).json({ error: 'Failed to retrieve request information' });
        }

        res.status(200).json(results);
    });
});

router.get('/get-request-by-parent-email', (req, res) => {
    const { Parent_Email } = req.query;

    const sql = `
        SELECT Request_No, Request_Date, Request_type, Request_detail, Request_status 
        FROM Request 
        WHERE Parent_Email = ?
    `;

    connection.query(sql, [Parent_Email], (err, results) => {
        if (err) {
            console.error('Error querying request information:', err);
            return res.status(500).json({ error: 'Failed to retrieve request information' });
        }

        res.status(200).json(results);
    });
});

router.get('/get-request-by-studentID-and-status', (req, res) => {
    const { Parent_Email, Student_ID, Request_status } = req.query;

    const sql = `
        SELECT Request_No, Request_Date, Request_type, Request_detail, Request_status 
        FROM Request 
        WHERE Parent_Email = ? AND Student_ID = ? AND Request_status = ?
    `;

    connection.query(sql, [Parent_Email, Student_ID, Request_status], (err, results) => {
        if (err) {
            console.error('Error querying request information:', err);
            return res.status(500).json({ error: 'Failed to retrieve request information' });
        }
        console.log(Parent_Email, Student_ID, Request_status ,results );
        res.status(200).json(results);
    });
});

router.post('/save-request', (req, res) => {
    const { Student_ID, Parent_Email, Request_Date, Request_type, Requested_Copies, Request_detail, Request_StudentPicture, Request_status } = req.body;

    const sql = `
        INSERT INTO Request (Student_ID, Parent_Email, Request_Date, Request_type, Requested_Copies, Request_detail, Request_StudentPicture, Request_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    connection.query(sql, [Student_ID, Parent_Email, Request_Date, Request_type, Requested_Copies, Request_detail, Request_StudentPicture, Request_status], (err, results) => {
        if (err) {
            console.error('Error saving request information:', err);
            return res.status(500).json({ error: 'Failed to save request information' });
        }

        return res.status(200).json({ message: 'Request information saved successfully' });
    });
});

router.get('/get-student-id-grade-by-parent-email', (req, res) => {
    const { email } = req.query;

    const sql = `
        SELECT s.Student_ID, s.NameTitle, s.FirstName, s.LastName
        FROM Student s
        INNER JOIN Student_ParentEmail spe ON s.Student_ID = spe.Student_ID
        WHERE s.Student_ID IN (
            SELECT Student_ID
            FROM Grade
        )
        AND (spe.first_ParentEmail = ? OR spe.second_ParentEmail = ? OR spe.third_ParentEmail = ?)
    `;

    connection.query(sql, [email, email, email], (err, results) => {
        if (err) {
            console.error('Error querying student information:', err);
            return res.status(500).json({ error: 'Failed to retrieve student information' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Student not found for the provided parent email' });
        }

        return res.status(200).json(results);
    });
});

router.get('/get-student-id-request-by-parent-email', (req, res) => {
    const { email } = req.query;

    const sql = `
        SELECT s.Student_ID, s.NameTitle, s.FirstName, s.LastName
        FROM Student s
        INNER JOIN Student_ParentEmail spe ON s.Student_ID = spe.Student_ID
        WHERE s.Student_ID IN (
            SELECT Student_ID
            FROM Request
        )
        AND (spe.first_ParentEmail = ? OR spe.second_ParentEmail = ? OR spe.third_ParentEmail = ?)
    `;

    connection.query(sql, [email, email, email], (err, results) => {
        if (err) {
            console.error('Error querying student information:', err);
            return res.status(500).json({ error: 'Failed to retrieve student information' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Student not found for the provided parent email' });
        }

        return res.status(200).json(results);
    });
});

router.get('/get-student-id-by-parent-email', (req, res) => {
    const { email } = req.query;

    const sql = `
        SELECT Student_ID, NameTitle, FirstName, LastName
        FROM Student
        WHERE Student_ID IN (
            SELECT Student_ID
            FROM Student_ParentEmail
            WHERE first_ParentEmail = ? OR second_ParentEmail = ? OR third_ParentEmail = ?
        )
    `;

    connection.query(sql, [email, email, email], (err, results) => {
        if (err) {
            console.error('Error querying student information:', err);
            return res.status(500).json({ error: 'Failed to retrieve student information' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Student not found for the provided parent email' });
        }

        return res.status(200).json(results);
    });
});

router.get('/get-years-by-student-id', (req, res) => {
    const { studentId } = req.query;

    const sql = `
        SELECT DISTINCT Year
        FROM Grade
        WHERE Student_ID = ?
    `;

    connection.query(sql, [studentId], (err, results) => {
        if (err) {
            console.error('Error querying years by student ID:', err);
            return res.status(500).json({ error: 'Failed to retrieve years' });
        }

        const years = results.map(result => result.Year);
        return res.status(200).json(years);
    });
});

router.get('/get-semesters-by-student-id', (req, res) => {
    const { studentId, Year } = req.query;

    const sql = `
        SELECT DISTINCT Semester
        FROM Grade
        WHERE Student_ID = ? AND Year = ?
    `;

    connection.query(sql, [studentId, Year], (err, results) => {
        if (err) {
            console.error('Error querying semesters by student ID:', err);
            return res.status(500).json({ error: 'Failed to retrieve semesters' });
        }

        const semesters = results.map(result => result.Semester);
        return res.status(200).json(semesters);
    });
});

router.get('/get-year-semesters-by-student-id', (req, res) => {
    const { studentId } = req.query;

    const sql = `
        SELECT DISTINCT Year, Semester
        FROM Grade
        WHERE Student_ID = ?
    `;

    connection.query(sql, [studentId], (err, results) => {
        if (err) {
            console.error('Error querying year and semesters by student ID:', err);
            return res.status(500).json({ error: 'Failed to retrieve year and semesters' });
        }

        return res.status(200).json(results);
    });
});

router.get('/get-grade-info', (req, res) => {
    const { studentId, year, semester } = req.query;

    const sql = `
        SELECT Grade.Subject_ID, Grade.Full_score_mid, Grade.Score_mid, Grade.Full_score_final, 
               Grade.Score_final, Grade.Total_score, Grade.Subject_grade, Subject.Subject_Name, 
               Subject.Subject_Credit
        FROM Grade
        INNER JOIN Subject ON Grade.Subject_ID = Subject.Subject_ID
        WHERE Grade.Student_ID = ? AND Grade.Year = ? AND Grade.Semester = ?
    `;

    connection.query(sql, [studentId, year, semester], (err, results) => {
        if (err) {
            console.error('Error querying grade information:', err);
            return res.status(500).json({ error: 'Failed to retrieve grade information' });
        }

        return res.status(200).json(results);
    });
});

router.get('/get-health-info', (req, res) => {
    const { studentId, year } = req.query;

    const sql = `
        SELECT Overall_Results, Growth_Nutrition, Summary_Health
        FROM Health_Overview
        WHERE Student_ID = ? AND Year = ?
    `;

    connection.query(sql, [studentId, year], (err, results) => {
        if (err) {
            console.error('Error querying health information:', err);
            return res.status(500).json({ error: 'Failed to retrieve health information' });
        }

        if (results.length === 0) {
            return res.status(404).json({ error: 'Health information not found' });
        }

        const healthInfo = results[0];
        return res.status(200).json(healthInfo);
    });
});

router.get('/get-growth-nutrition-info', (req, res) => {
    const { studentId, year, semester } = req.query;

    const sql = `
        SELECT Health_Check_Date, Student_Age, Height, Weight
        FROM Growth_Nutrition
        WHERE Student_ID = ? AND Year = ? AND Semester = ?
    `;

    connection.query(sql, [studentId, year, semester], (err, results) => {
        if (err) {
            console.error('Error querying growth nutrition information:', err);
            return res.status(500).json({ error: 'Failed to retrieve growth nutrition information' });
        }

        return res.status(200).json(results);
    });
});

router.get('/get-health-check-info', (req, res) => {
    const { studentId } = req.query;

    const sql = `
        SELECT Date, Eye_examination, Hearing, Oral_health
        FROM Health_Check
        WHERE Student_ID = ?
    `;

    connection.query(sql, [studentId], (err, results) => {
        if (err) {
            console.error('Error querying health check information:', err);
            return res.status(500).json({ error: 'Failed to retrieve health check information' });
        }

        return res.status(200).json(results);
    });
});

router.get('/get-basic-vaccines', (req, res) => {
    const sql = `
        SELECT BasicVaccine_name
        FROM Basic_Vaccine
    `;

    connection.query(sql, (err, results) => {
        if (err) {
            console.error('Error querying basic vaccine information:', err);
            return res.status(500).json({ error: 'Failed to retrieve basic vaccine information' });
        }

        const basicVaccines = results.map(result => result.BasicVaccine_name);
        return res.status(200).json(basicVaccines);
    });
});

router.get('/get-basic-injection-info', (req, res) => {
    const { studentId } = req.query;

    const sql = `
        SELECT ibv.Vaccinated_Date, ibv.Side_Effects, ibv.Note, bv.BasicVaccine_name
        FROM Injection_Basic_Vaccine AS ibv
        INNER JOIN Basic_Vaccine AS bv ON ibv.Basic_Vaccine_ID = bv.Basic_Vaccine_ID
        WHERE ibv.Student_ID = ?
    `;

    connection.query(sql, [studentId], (err, results) => {
        if (err) {
            console.error('Error querying injection information:', err);
            return res.status(500).json({ error: 'Failed to retrieve injection information' });
        }

        return res.status(200).json(results);
    });
});

// router.get('/get-alternative-vaccine-info/:studentId', (req, res) => {
router.get('/get-alternative-vaccine-info', (req, res) => {
    // let studentId;
    // if (req.query.studentId) {
    //     studentId = req.query.studentId;
    // } else if (req.params.studentId) {
    //     studentId = req.params.studentId;
    // } else {
    //     return res.status(400).json({ error: 'Student ID is required' });
    // }
    const { studentId } = req.query;
    
    const sql = `
      SELECT Vaccine_name, Vaccinated_Date, Side_Effects, Note
      FROM Injection_Alternative_vaccine
      WHERE Student_ID = ?
    `;
    
    connection.query(sql, [studentId], (err, results) => {
      if (err) {
        console.error('Error querying alternative vaccine information:', err);
        return res.status(500).json({ error: 'Failed to retrieve alternative vaccine information' });
      }
  
      return res.status(200).json(results);
    });
  });

router.get('/get-congenital-disease-info', (req, res) => {
const { studentId } = req.query;

// สร้างคำสั่ง SQL สำหรับดึงข้อมูล
const sql = `
    SELECT Date, Congenital_Disease
    FROM congenital_disease
    WHERE Student_ID = ?
`;

// ดำเนินการค้นหาในฐานข้อมูล
connection.query(sql, [studentId], (err, results) => {
    if (err) {
            // กรณีเกิดข้อผิดพลาดในการค้นหา
            console.error('Error querying congenital disease information:', err);
            return res.status(500).json({ error: 'Failed to retrieve congenital disease information' });
        }

        // ส่งข้อมูลที่ค้นพบกลับไปให้กับผู้ใช้
        return res.status(200).json(results);
    });
});

router.get('/get-History-disease-info', (req, res) => {
    const { studentId } = req.query;

    // สร้างคำสั่ง SQL สำหรับดึงข้อมูล
    const sql = `
        SELECT Date, History_Disease
        FROM History_Disease
        WHERE Student_ID = ?
    `;

    // ดำเนินการค้นหาในฐานข้อมูล
    connection.query(sql, [studentId], (err, results) => {
        if (err) {
                // กรณีเกิดข้อผิดพลาดในการค้นหา
                console.error('Error querying History disease information:', err);
                return res.status(500).json({ error: 'Failed to retrieve History disease information' });
            }

            // ส่งข้อมูลที่ค้นพบกลับไปให้กับผู้ใช้
            return res.status(200).json(results);
        });
    });
    
router.get('/get-Allergies-info', (req, res) => {
    const { studentId } = req.query;

    // สร้างคำสั่ง SQL สำหรับดึงข้อมูล
    const sql = `
        SELECT Date, Allergies
        FROM Allergies
        WHERE Student_ID = ?
    `;

    // ดำเนินการค้นหาในฐานข้อมูล
    connection.query(sql, [studentId], (err, results) => {
        if (err) {
                // กรณีเกิดข้อผิดพลาดในการค้นหา
                console.error('Error querying Allergies information:', err);
                return res.status(500).json({ error: 'Failed to retrieve Allergies information' });
            }

            // ส่งข้อมูลที่ค้นพบกลับไปให้กับผู้ใช้
            return res.status(200).json(results);
        });
    });

router.get('/get-Surgery_accident-info', (req, res) => {
    const { studentId } = req.query;

    // สร้างคำสั่ง SQL สำหรับดึงข้อมูล
    const sql = `
        SELECT Date, Surgery_accident
        FROM Surgery_accident
        WHERE Student_ID = ?
    `;

    // ดำเนินการค้นหาในฐานข้อมูล
    connection.query(sql, [studentId], (err, results) => {
        if (err) {
                // กรณีเกิดข้อผิดพลาดในการค้นหา
                console.error('Error querying Surgery_accident information:', err);
                return res.status(500).json({ error: 'Failed to retrieve Surgery_accident information' });
            }

            // ส่งข้อมูลที่ค้นพบกลับไปให้กับผู้ใช้
            return res.status(200).json(results);
        });
    });

// //เพิ่มข้อมูลผู้สมัครลงฐานข้อมูล
// router.post('/addApplicant', (req, res) => {
//     const applicantData = {
//         Student_NID: req.body.Student_NID,
//         NameTitle: req.body.NameTitle,
//         FirstName: req.body.FirstName,
//         LastName: req.body.LastName,
//         Student_DOB: req.body.Student_DOB,
//         Avatar: req.body.Avatar,
//         House_No: req.body.House_No,
//         Moo: req.body.Moo,
//         Soi: req.body.Soi,
//         Road: req.body.Road,
//         Province: req.body.Province,
//         District: req.body.District,
//         Sub_District: req.body.Sub_District,
//         Transcript_type: req.body.Transcript_type,
//         Transcript_file: req.body.Transcript_file,
//         BirthCert_file: req.body.BirthCert_file,
//         HouseReg_file: req.body.HouseReg_file,
//         ParentEmail: req.body.ParentEmail
//     };

//     // Insert data into Applicant table
//     connection.query('INSERT INTO Applicant SET ?', applicantData, (error, applicantResult, fields) => {
//         if (error) {
//             console.error('Error inserting data into Applicant table: ' + error.message);
//             return res.status(500).json({ error: 'Error inserting data into Applicant database' });
//         }

//         console.log('Applicant data inserted successfully');
        
//         // Insert data into Applicant_ParentEmail table
//         const applicantID = applicantResult.insertId;
//         const parentEmailData = {
//             Student_NID: req.body.Student_NID,
//             Applicant_ID: applicantID,
//             first_ParentEmail: req.body.first_ParentEmail,
//             second_ParentEmail: req.body.second_ParentEmail,
//             third_ParentEmail: req.body.third_ParentEmail
//         };

//         connection.query('INSERT INTO Applicant_ParentEmail SET ?', parentEmailData, (err, parentEmailResult, fields) => {
//             if (err) {
//                 console.error('Error inserting data into Applicant_ParentEmail table: ' + err.message);
//                 return res.status(500).json({ error: 'Error inserting data into database' });
//             }

//             console.log('Parent email data inserted successfully');
//             return res.status(200).json({ message: 'Data inserted successfully' });
//         });
//     });
// });

//เพิ่มข้อมูบลผู้สมัครลงฐานข้อมูล
router.post('/addApplicant', async (req, res) => {
    const applicantData = {
        Student_NID: req.body.Student_NID,
        NameTitle: req.body.NameTitle,
        FirstName: req.body.FirstName,
        LastName: req.body.LastName,
        Student_DOB: req.body.Student_DOB,
        Avatar: req.body.Avatar,
        House_No: req.body.House_No,
        Moo: req.body.Moo,
        Soi: req.body.Soi,
        Road: req.body.Road,
        Province: req.body.Province,
        District: req.body.District,
        Sub_District: req.body.Sub_District,
        Transcript_type: req.body.Transcript_type,
        Transcript_file: req.body.Transcript_file,
        BirthCert_file: req.body.BirthCert_file,
        HouseReg_file: req.body.HouseReg_file,
        ParentEmail: req.body.ParentEmail
    };

    try {
        const release = await mutex.acquire();
        try {
            // Insert data into Applicant table
            const applicantResult = await insertApplicant(applicantData);
            
            // Insert data into Applicant_ParentEmail table
            await insertParentEmail(applicantData.Student_NID, applicantResult.insertId, req.body.first_ParentEmail, req.body.second_ParentEmail, req.body.third_ParentEmail);
            
            console.log('Data inserted successfully');
            return res.status(200).json({ message: 'Data inserted successfully' });
        } finally {
            release();
        }
    } catch (error) {
        console.error('Error inserting data:', error);
        return res.status(500).json({ error: 'Error inserting data into database' });
    }
});

async function insertApplicant(data) {
    return new Promise((resolve, reject) => {
        connection.query('INSERT INTO Applicant SET ?', data, (error, result, fields) => {
            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        });
    });
}

async function insertParentEmail(studentNID, applicantID, firstParentEmail, secondParentEmail, thirdParentEmail) {
    const parentEmailData = {
        Student_NID: studentNID,
        Applicant_ID: applicantID,
        first_ParentEmail: firstParentEmail,
        second_ParentEmail: secondParentEmail,
        third_ParentEmail: thirdParentEmail
    };

    return new Promise((resolve, reject) => {
        connection.query('INSERT INTO Applicant_ParentEmail SET ?', parentEmailData, (error, result, fields) => {
            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        });
    });
}

// คิวรี่ข้อมูลการสมัครเรียนด้วย applicantId
// router.get("/CheckEnroll_status/:applicantId", async (req, res) => {
//     const applicantId = req.params.applicantId;

//     try {
//         connection.query(
//             "SELECT app.NameTitle, app.FirstName, app.LastName, app.Student_NID, enroll.Enroll_ID, enroll.Enroll_Year, enroll.Enroll_Course, enroll.Enroll_Status FROM applicant AS app JOIN enrollment AS enroll ON app.Applicant_ID = enroll.Enroll_ID WHERE app.Applicant_ID = ?",
//             [applicantId],
//             (err, results, fields) => {
//                 if (err) {
//                     console.log("Error while retrieving data from the database", err);
//                     return res.status(500).json({ error: err.message });
//                 }

//                 if (results.length === 0) {
//                     return res.status(404).json({ error: "Applicant not found" });
//                 }

//                 // Map through the results array to format the data
//                 const formattedData = results.map(result => ({
//                     NameTitle: result.NameTitle,
//                     FirstName: result.FirstName,
//                     LastName: result.LastName,
//                     Student_NID: result.Student_NID,
//                     Enroll_No: result.Enroll_ID,
//                     // Enroll_No: result.Enroll_No,
//                     Enroll_Year: result.Enroll_Year,
//                     Enroll_Course: result.Enroll_Course,
//                     Enroll_Status: result.Enroll_Status
//                 }));

//                 return res.status(200).json(formattedData);
//             }
//         );
//     } catch (err) {
//         console.log(err);
//         return res.status(500).send();
//     }
// });

// คิวรี่ข้อมูลการสมัครเรียนด้วย เลขที่ผู้สมัคร ปี และหลักสูตร
router.get("/CheckEnroll_status", async (req, res) => {
    const Enroll_ID = req.query.Enroll_ID;
    const Enroll_Year = req.query.Enroll_Year;
    const Enroll_Course = req.query.Enroll_Course;

    try {
        connection.query(
            "SELECT app.NameTitle, app.FirstName, app.LastName, app.Student_NID, enroll.Enroll_ID, enroll.Enroll_Year, enroll.Enroll_Course, enroll.Enroll_Status FROM applicant AS app JOIN enrollment AS enroll ON app.Student_NID = enroll.Student_NID WHERE enroll.Student_NID = ? AND enroll.Enroll_Year = ? AND enroll.Enroll_Course = ?",
            [Enroll_ID, Enroll_Year, Enroll_Course],
            (err, results, fields) => {
                if (err) {
                    console.log("Error while retrieving data from the database", err);
                    return res.status(500).json({ error: err.message });
                }

                if (results.length === 0) {
                    return res.status(404).json({ error: "Applicant not found" });
                }

                // Map through the results array to format the data
                const formattedData = results.map(result => ({
                    NameTitle: result.NameTitle,
                    FirstName: result.FirstName,
                    LastName: result.LastName,
                    Student_NID: result.Student_NID,
                    Enroll_No: result.Enroll_ID,
                    Enroll_Year: result.Enroll_Year,
                    Enroll_Course: result.Enroll_Course,
                    Enroll_Status: result.Enroll_Status
                }));

                return res.status(200).json(formattedData);
            }
        );
    } catch (err) {
        console.log(err);
        return res.status(500).send();
    }
});

//คิวรี่ข้อมูลของผู้สมัครจาก parentEmail สำหรับนำมาแสดงบน dropdown
router.get("/dropdownArray_EnrollStatus/:parentEmail", async (req, res) => {
    const parentEmail = req.params.parentEmail;

    try {
        // Query to get Student_NIDs from Applicant_ParentEmail table based on the provided ParentEmail
        connection.query(
            "SELECT Student_NID FROM Applicant_ParentEmail WHERE first_ParentEmail = ? OR second_ParentEmail = ? OR third_ParentEmail = ?",
            [parentEmail, parentEmail, parentEmail],
            (err, parentEmailResults, fields) => {
                if (err) {
                    console.log("Error while retrieving data from the database", err);
                    return res.status(500).json({ error: err.message });
                }

                if (parentEmailResults.length === 0) {
                    return res.status(404).json({ error: "No applicant found with this email" });
                }

                const studentNIDs = parentEmailResults.map(result => result.Student_NID);

                // Query to fetch details from Applicant table based on the obtained Student_NIDs
                connection.query(
                    "SELECT app.FirstName, app.LastName, enroll.Enroll_ID, enroll.Student_NID, enroll.Enroll_Year, enroll.Enroll_Course FROM Applicant AS app INNER JOIN Enrollment AS enroll ON app.Student_NID = enroll.Student_NID WHERE app.Student_NID IN (?)",
                    [studentNIDs], // ใส่ค่า studentNIDs เข้าไปในพารามิเตอร์นี้
                    (err, applicantResults, fields) => {
                        // ตราบเท่าที่คำสั่ง SQL นี้ถูกเรียกใช้ด้วยค่า studentNIDs ที่ถูกส่งมาในพารามิเตอร์ของ query มันจะทำงานได้ถูกต้อง
                        if (err) {
                            console.log("Error while retrieving data from the database", err);
                            return res.status(500).json({ error: err.message });
                        }
                        
                        if (applicantResults.length === 0) {
                            return res.status(404).json({ error: "No applicant details found" });
                        }
                
                        // Prepare the data in the desired format
                        const formattedData = {
                            array: Array.from(new Set(applicantResults.map(result => result.Student_NID))),
                            // array: applicantResults.map(result => result.Student_NID),
                            Name: Array.from(new Set(applicantResults.map(result => result.FirstName + " " + result.LastName))),
                            // Name: applicantResults.map(result => result.FirstName + " " + result.LastName),
                            Enroll_ID: Array.from(new Set(applicantResults.map(result => result.Enroll_ID))),
                            Enroll_Year: Array.from(new Set(applicantResults.map(result => result.Enroll_Year))),
                            Enroll_Course: Array.from(new Set(applicantResults.map(result => result.Enroll_Course)))
                        };
                
                        return res.status(200).json([formattedData]);
                    }
                );
                
                
            }
        );
    } catch (err) {
        console.log(err);
        return res.status(500).send();
    }
});

//คิวรี่สำหรับหาข้อมูลของผู้สมัคร เพื่อที่จะนำมาใช้ในการแสดงข้อมูลการสมัครเรียน แบบ default --> ไม่ใช้แล้ว**
// router.get("/defaultData_EnrollStatus/:parentEmail", async (req, res) => {
//     const parentEmail = req.params.parentEmail;

//     try {
//         // Query to get Student_NIDs from Applicant_ParentEmail table based on the provided ParentEmail
//         connection.query(
//             "SELECT Student_NID FROM Applicant_ParentEmail WHERE first_ParentEmail = ? OR second_ParentEmail = ? OR third_ParentEmail = ?",
//             [parentEmail, parentEmail, parentEmail],
//             (err, parentEmailResults, fields) => {
//                 if (err) {
//                     console.log("Error while retrieving data from the database", err);
//                     return res.status(500).json({ error: err.message });
//                 }

//                 if (parentEmailResults.length === 0) {
//                     return res.status(404).json({ error: "No applicant found with this email" });
//                 }

//                 const studentNIDs = parentEmailResults.map(result => result.Student_NID);

//                 // Query to fetch details from Applicant table based on the obtained Student_NIDs
//                 connection.query(
//                     "SELECT app.FirstName, app.LastName, enroll.Enroll_ID, enroll.Enroll_Year, enroll.Enroll_Course FROM Applicant AS app INNER JOIN Enrollment AS enroll ON app.Student_NID = enroll.Student_NID WHERE app.Student_NID IN (?)",
//                     [studentNIDs],
//                     (err, applicantResults, fields) => {
//                         if (err) {
//                             console.log("Error while retrieving data from the database", err);
//                             return res.status(500).json({ error: err.message });
//                         }
                
//                         if (applicantResults.length === 0) {
//                             return res.status(404).json({ error: "No applicant details found" });
//                         }

//                         // Prepare the data in the desired format
//                         // Convert to Set to remove duplicates
//                         const formattedData = {
//                             // array: Array.from(new Set(studentNIDs)), 
//                             array: Array.from(studentNIDs), 
//                             Name: Array.from(new Set(applicantResults.map(result => result.FirstName + " " + result.LastName))),
//                             Enroll_ID: Array.from(new Set(applicantResults.map(result => result.Enroll_ID))),
//                             Enroll_Year: Array.from(new Set(applicantResults.map(result => result.Enroll_Year))),
//                             Enroll_Course: Array.from(new Set(applicantResults.map(result => result.Enroll_Course)))
//                         };

//                         // Query to find the maximum Enroll_Year
//                         const maxEnrollYear = Math.max(...formattedData.Enroll_Year);
//                         const maxEnrollID = Math.max(...formattedData.Enroll_ID);
                        
//                         // Count unique values of Enroll_Course
//                         const uniqueEnrollCourses = new Set(formattedData.Enroll_Course);
//                         const courseCount = uniqueEnrollCourses.size;

//                         // Prepare the final response
//                         const finalResponse = [{
//                             Enroll_ID: maxEnrollID.toString(),
//                             Enroll_Year: maxEnrollYear.toString(),
//                             Enroll_Course: courseCount === 1 ? Array.from(uniqueEnrollCourses)[0] : (courseCount >= 2 ? "หลักสูตรปกติ" : "ไม่พบข้อมูลการสมัครเรียน")
//                         }];

//                         return res.status(200).json(finalResponse);
//                     }
//                 );
                
//             }
//         );
//     } catch (err) {
//         console.log(err);
//         return res.status(500).send();
//     }
// });

//แสดงข้อมูลหน้าตรวจสอบสถานะการสมัครเรียนแบบ default แสดงข้อมูลการสมัครเรียนของผู้สมัครทุกคน ในทุกปีการศึกษา และหลักสูตร
router.get("/DropdownData_EnrollStatus/:parentEmail", async (req, res) => {
    const parentEmail = req.params.parentEmail;

    try {
        // Query to get Student_NIDs from Applicant_ParentEmail table based on the provided ParentEmail
        connection.query(
            "SELECT Student_NID FROM Applicant_ParentEmail WHERE first_ParentEmail = ? OR second_ParentEmail = ? OR third_ParentEmail = ?",
            [parentEmail, parentEmail, parentEmail],
            (err, parentEmailResults, fields) => {
                if (err) {
                    console.log("Error while retrieving data from the database", err);
                    return res.status(500).json({ error: err.message });
                }

                if (parentEmailResults.length === 0) {
                    return res.status(404).json({ error: "No applicant found with this email" });
                }

                const studentNIDs = parentEmailResults.map(result => result.Student_NID);

                // Query to fetch details from Applicant table based on the obtained Student_NIDs
                connection.query(
                    "SELECT app.NameTitle, app.FirstName, app.LastName, app.Student_NID, enroll.Enroll_ID, enroll.Enroll_Year, enroll.Enroll_Course, enroll.Enroll_Status FROM Applicant AS app INNER JOIN Enrollment AS enroll ON app.Student_NID = enroll.Student_NID WHERE app.Student_NID IN (?)",
                    [studentNIDs],
                    (err, applicantResults, fields) => {
                        if (err) {
                            console.log("Error while retrieving data from the database", err);
                            return res.status(500).json({ error: err.message });
                        }

                        const formattedData = applicantResults.map(applicantResults => ({
                            NameTitle: applicantResults.NameTitle,
                            FirstName: applicantResults.FirstName,
                            LastName: applicantResults.LastName,
                            Student_NID: applicantResults.Student_NID,
                            Enroll_No: applicantResults.Enroll_ID,
                            Enroll_Year: applicantResults.Enroll_Year,
                            Enroll_Course: applicantResults.Enroll_Course,
                            Enroll_Status: applicantResults.Enroll_Status
                        }));
                
                        return res.status(200).json(formattedData);
                    }
                );
                
            }
        );
    } catch (err) {
        console.log(err);
        return res.status(500).send();
    }
});

//แสดงข้อมูลหน้าตรวจสอบสถานะการสมัครเรียนแบบ default เลือกแสดงจากผู้สมัครคนล่าสุด
router.get("/defaultData_EnrollStatus/:parentEmail", async (req, res) => {
    const parentEmail = req.params.parentEmail;

    try {
        // Query to get Student_NIDs from Applicant_ParentEmail table based on the provided ParentEmail
        connection.query(
            "SELECT Student_NID FROM Applicant_ParentEmail WHERE first_ParentEmail = ? OR second_ParentEmail = ? OR third_ParentEmail = ?",
            [parentEmail, parentEmail, parentEmail],
            (err, parentEmailResults, fields) => {
                if (err) {
                    console.log("Error while retrieving data from the database", err);
                    return res.status(500).json({ error: err.message });
                }

                if (parentEmailResults.length === 0) {
                    return res.status(404).json({ error: "No applicant found with this email" });
                }

                const studentNIDs = parentEmailResults.map(result => result.Student_NID);

                // Query to fetch details from Applicant table based on the obtained Student_NIDs
                connection.query(
                    "SELECT app.FirstName, app.LastName, enroll.Enroll_ID, enroll.Enroll_Year, enroll.Enroll_Course FROM Applicant AS app INNER JOIN Enrollment AS enroll ON app.Student_NID = enroll.Student_NID WHERE app.Student_NID IN (?)",
                    [studentNIDs],
                    (err, applicantResults, fields) => {
                        if (err) {
                            console.log("Error while retrieving data from the database", err);
                            return res.status(500).json({ error: err.message });
                        }
                
                        if (applicantResults.length === 0) {
                            return res.status(404).json({ error: "No applicant details found" });
                        }

                        // Prepare the data in the desired format
                        // Convert to Set to remove duplicates
                        const formattedData = {
                            array: Array.from(studentNIDs), 
                            Name: Array.from(new Set(applicantResults.map(result => result.FirstName + " " + result.LastName))),
                            Enroll_ID: Array.from(new Set(applicantResults.map(result => result.Enroll_ID))),
                            Enroll_Year: Array.from(new Set(applicantResults.map(result => result.Enroll_Year))),
                            Enroll_Course: Array.from(new Set(applicantResults.map(result => result.Enroll_Course)))
                        };

                        // Query to find the maximum Enroll_Year
                        const maxEnrollYear = Math.max(...formattedData.Enroll_Year);
                        const maxEnrollID = Math.max(...formattedData.Enroll_ID);
                        
                        // Count unique values of Enroll_Course
                        const uniqueEnrollCourses = new Set(formattedData.Enroll_Course);
                        const courseCount = uniqueEnrollCourses.size;

                        // Prepare the final response
                        const finalResponse = [{
                            Enroll_ID: maxEnrollID.toString(),
                            Enroll_Year: maxEnrollYear.toString(),
                            Enroll_Course: courseCount === 1 ? Array.from(uniqueEnrollCourses)[0] : (courseCount >= 2 ? "หลักสูตรปกติ" : "ไม่พบข้อมูลการสมัครเรียน")
                        }];

                        // Now, using the Enroll_ID from the finalResponse, proceed with the next query
                        const enrollID = finalResponse[0].Enroll_ID;
                        connection.query(
                            "SELECT app.NameTitle, app.FirstName, app.LastName, app.Student_NID, enroll.Enroll_ID, enroll.Enroll_Year, enroll.Enroll_Course, enroll.Enroll_Status FROM Applicant AS app JOIN Enrollment AS enroll ON app.Student_NID = enroll.Student_NID WHERE enroll.Enroll_ID = ?",
                            [enrollID],
                            (err, results, fields) => {
                                if (err) {
                                    console.log("Error while retrieving data from the database", err);
                                    return res.status(500).json({ error: err.message });
                                }

                                if (results.length === 0) {
                                    return res.status(404).json({ error: "Applicant not found" });
                                }

                                // Map through the results array to format the data
                                const formattedData = results.map(result => ({
                                    NameTitle: result.NameTitle,
                                    FirstName: result.FirstName,
                                    LastName: result.LastName,
                                    Student_NID: result.Student_NID,
                                    Enroll_No: result.Enroll_ID,
                                    Enroll_Year: result.Enroll_Year,
                                    Enroll_Course: result.Enroll_Course,
                                    Enroll_Status: result.Enroll_Status
                                }));

                                return res.status(200).json(formattedData);
                            }
                        );

                    }
                );
                
            }
        );
    } catch (err) {
        console.log(err);
        return res.status(500).send();
    }
});


return router;

}
// module.exports = router;
// app.listen(5000, function () {
//     console.log('CORS-enabled web server listening on port 5000')
//   })