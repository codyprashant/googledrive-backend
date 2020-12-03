const express = require("express");
const filesRoute = express.Router();
const mongoDB = require("mongodb");
const aws = require("aws-sdk");
const multerS3 = require("multer-s3");
const multer = require("multer");
const path = require("path");
const jwt_decode = require("jwt-decode");
const S3Sizer = require('aws-s3-size');
const nodemailer = require("nodemailer");

const s3 = new aws.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  Bucket: process.env.AWS_BUCKET_NAME,
});
const s3Sizer = new S3Sizer({s3 : s3});
const { authorize, allowUser } = require("../middlewares/auth");
const mongoClient = mongoDB.MongoClient;
const objId = mongoDB.ObjectID;
const dbUrl = process.env.DB_URL;

const profileImgUpload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_BUCKET_NAME,
    acl: "public-read",
    key: function (req, file, cb) {
      cb(
        null,
        `${getUserId(req.headers.authorization)}/tempShare/`+path.basename(file.originalname, path.extname(file.originalname)) + "-" + Date.now() + path.extname(file.originalname)
      );
    },
  }),
  limits: { fileSize: 5000000 }, // In bytes: 5000000 bytes = 5 MB
}).single("file");

const getUserId = (token) => {
  var decoded = jwt_decode(token);
  return decoded.userId;
};

filesRoute.post("/uploadSharingFile", authorize, async (req, res) => {
let userId = getUserId(req.headers.authorization);

  profileImgUpload(req, res, async (error) => {
    if (error) {
      console.log("errors", error);
      res.json({ error: "ERROR", message: "File Uploading Failed" });
    } else {
        console.log(req.body.firstName)
      if (req.file === undefined ) {
        res.json({ error: "ERROR", message: "No File Selected" });
      } else {
        try {
          let client = await mongoClient.connect(dbUrl, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
          });
          let db = client.db("googledriveclone");
          let fileDetail = req.file;
          var datetime = new Date();
     
          let data = await db.collection("users").findOne({ _id: objId(userId) });
          if (data) {
            let result = await db.collection("sharedFiles").insertOne({
              userId: objId(data._id),
              origfileName: fileDetail.originalname,
              s3FileName: fileDetail.key,
              bucketName: fileDetail.bucket,
              fileType: fileDetail.mimetype,
              fileSize: fileDetail.size,
              publicUrl: fileDetail.location,
              creationDate: datetime,
              firstName: req.body.firstName,
              lastName: req.body.lastName,
              receiveremail:req.body.receiveremail,
              senderEmail: data.email,
              expired: 0
            });
            let sendRes = await sendEmail(data.email, req.body.receiveremail, fileDetail.location, fileDetail.originalname, `${req.body.firstName} ${req.body.lastName}`)
            // if(sendRes) res.json({ status: "SUCCESS"  });
            // else res.json({ error: "ERROR", message: "Email Failed" });
            client.close();
            res.json({ status: "SUCCESS"  });
            
          } else {
            client.close();
            res.json({ error: "ERROR", message: "Invalid User" });
          }
        } catch (e) {
          console.log(e);
          res.json({ status: "ERROR", message: "Something went wrong" });
        }
      }
    }
  });
});

filesRoute.get("/getAllSharedFiles", authorize, async (req, res) => {
  try {
    let client = await mongoClient.connect(dbUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    let db = client.db("googledriveclone");
    let userId = getUserId(req.headers.authorization);
    let data = await db.collection("users").findOne({ _id: objId(userId) });
    if (data) {
      let result2 = await db
        .collection("sharedFiles")
        .find({ userId: objId(data._id) })
        .toArray();
        client.close();
      res.json({
        status: "SUCCESS",
        data: result2,
      });
    } else {
      client.close();
      res.json({ error: "ERROR", message: "Invalid User" });
    }
  } catch (e) {
    console.log(e);
    res.json({ status: "ERROR", message: "Something went wrong" });
  }
});


filesRoute.post("/deleteSharedFile", authorize, async (req, res) => {
  try {
    let client = await mongoClient.connect(dbUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    let db = client.db("googledriveclone");
    let itemId = req.body.itemId;
    let userId = getUserId(req.headers.authorization);
    if (itemId) {
      let result2 = await db.collection("files").find({ _id: objId(itemId) }).toArray();
      var params = { Bucket: process.env.AWS_BUCKET_NAME, Key: result2[0].s3FileName };
      await s3.deleteObject(params, async function(err, data) {
        if (err){ 
          console.log(err, err.stack);
          client.close();
          res.json({ status: "ERROR", message: "Something went wrong, File not Deleted" });
        } 
        else{
          let deleteRes = await db.collection("files").deleteOne({ _id: objId(itemId) });
          let newFiles = await db.collection("files").find({ userId: objId(result2[0].userId) }).toArray();
          client.close();
          res.json({ status: "SUCCESS", delStatus:deleteRes, message: "File Deleted Successfully", data:newFiles });
        }
      });
    } else {
      client.close();
      res.json({ error: "ERROR", message: "Invalid File" });
    }
  } catch (e) {
    console.log(e);
    res.json({ status: "ERROR", message: "Something went wrong" });
  }
});



async function sendEmail(email, receiveremail, fileUrl, originalname, username) {

    let transporter = nodemailer.createTransport({
        host: 'mail.zaiffly.com',
        port: 465,
        auth: {
            user: process.env.EMAIL,
            pass: process.env.PASSWORD
        }
    });
  
    var message = ` Hi ${username},
                "${originalname}" has been shared with you by ${email}.<br /> Please download the file using below URL
                        <a href="${fileUrl}"> Download File</a>
                        <br /><br />
                        NOTE: This file will be delete automatically and will not be availble after 48 hrs.`

    var mailOptions = {
        from: process.env.EMAIL,
        to: receiveremail, 
        subject: `FIle shared by ${email}`,
        html: message
    }
    
    await transporter.sendMail(mailOptions, function(error, response){
        if(error){
            console.log(error);
            return false;
        }
        // if(response){
            console.log(response)
            return true;
        // } else{
        //   return false;
        // }
        
    });
}













module.exports = filesRoute;
