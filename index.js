const express = require('express');
const app = express();
const cors = require("cors");

const session = require('express-session');

// const protectedRouter = require('./routes/protected-route');

const passportSetup = require("./passport");
const passport = require("passport");
const authRoute = require("./routes/auth");

// const iconv = require('iconv-lite');
// const multer = require("multer"); // import multer ก่อน stream
// const stream = require("stream"); // import stream หลังจาก multer

// const storage = multer.memoryStorage();

// const path = require("path");
// const { google } = require("googleapis");
// const app = express();
// const upload = multer({ storage: storage });

require('dotenv').config();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// app.use(fileUpload());

app.use(
	session({
	  // secret: "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",
    secret: process.env.GOOGLE_CLIENT_SECRET,
	  resave: false,
	  saveUninitialized: true,
	})
  );

app.use(passport.initialize());
app.use(passport.session());

app.use(
  cors({
    // origin: "http://localhost:5173",
    origin: process.env.CLIENT_URL,
    methods: "GET,POST,PUT,DELETE",
    credentials: true,
  })
);

app.use("/auth", authRoute);

app.get('/auth/login/success', (req, res) => {
  // ตรวจสอบว่าผู้ใช้ล็อกอินเข้ามาด้วย Google OAuth หรือไม่
  if (req.user && req.user.email) {
    const userEmail = req.user.email; // ดึงอีเมล์ของผู้ใช้
    const userData = req.user; // เก็บข้อมูลผู้ใช้ทั้งหมดไว้ใน userData
    userData.email = userEmail; // เพิ่มข้อมูลอีเมล์ลงใน userData
    res.json({ user: userData }); // ส่งข้อมูลผู้ใช้ทั้งหมดกลับไปยัง React frontend
  } else {
    res.status(401).json({ error: "Authentication failed!" });
  }  
});



// app.get('/NewStudent_info', (req, res) => {
//   // res.sendFile(`${__dirname}/index.html`);
//   res.sendFile("C:/Users/promp/Downloads/School-project/client/src/pages/NewStudent_info.jsx");
// });

// app.listen("5000", () => {
//   console.log("Server is running!");
// });

const PORT = 5000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
})


// const KEYFILEPATH = path.join(__dirname, "school-project-ggDrive.json");
// const SCOPES = ["https://www.googleapis.com/auth/drive"];

// const auth = new google.auth.GoogleAuth({
//     keyFile: KEYFILEPATH,
//     scopes: SCOPES,
// });

// app.post("/upload", upload.any(), async (req, res) => {
//   try {
//       console.log(req.body);
//       console.log(req.files);
//       const { body, files } = req;

//       console.log("yok",files);

//       for (let f = 0; f < files.length; f += 1) {
//           await uploadFile(files[f]);
//       }

//       res.status(200).send("Form Submitted");
//   } catch (f) {
//       res.send(f.message);
//   }
// });

// const uploadFile = async (fileObject) => {
//   const bufferStream = new stream.PassThrough();
//   bufferStream.end(fileObject.buffer);
//   // ใช้ iconv-lite ในการ decode ชื่อไฟล์
//   const originalFilename = iconv.decode(Buffer.from(fileObject.originalname, 'binary'), 'utf-8');
//   console.log('originalFilename', originalFilename);
//   const { data } = await google.drive({ version: "v3", auth }).files.create({
//       media: {
//           mimeType: fileObject.mimeType,
//           body: bufferStream,
//       },
//       requestBody: {
//           name: originalFilename,
//           parents: ["1r4FBXi6cFjxg_WXNiMX9mQQ1EJHmeIyw"],
//       },
//       fields: "id,name",
//   });
//   console.log(`Uploaded file ${data.name} ${data.id}`);
//   console.log(`https://drive.google.com/file/d/${data.id}`);
// };
// console.log(`https://drive.google.com/uc?id=${data.id}`);