const express = require("express");
const filesRoute = express.Router();
const mongoDB = require("mongodb");
const aws = require("aws-sdk");
const multerS3 = require("multer-s3");
const multer = require("multer");
const path = require("path");
const jwt_decode = require("jwt-decode");

const s3 = new aws.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  Bucket: process.env.AWS_BUCKET_NAME,
});

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
        `${getUserId(req.headers.authorization)}/uploads/`+path.basename(file.originalname, path.extname(file.originalname)) + "-" + Date.now() + path.extname(file.originalname)
      );
    },
  }),
  limits: { fileSize: 2000000 }, // In bytes: 20000000 bytes = 20 MB
}).single("file");

const getUserId = (token) => {
  var decoded = jwt_decode(token);
  return decoded.userId;
};

filesRoute.post("/uploadSingleFile", authorize, async (req, res) => {
let userId = getUserId(req.headers.authorization);
  profileImgUpload(req, res, async (error) => {
    if (error) {
      console.log("errors", error);
      res.json({ error: "ERROR", message: "File Uploading Failed" });
    } else {
      if (req.file === undefined) {
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
     
          let data = await db
            .collection("users")
            .findOne({ _id: objId(userId) });
          if (data) {
            let result = await db.collection("files").insertOne({
              userId: objId(data._id),
              origfileName: fileDetail.originalname,
              s3FileName: fileDetail.key,
              bucketName: fileDetail.bucket,
              fileType: fileDetail.mimetype,
              fileSize: fileDetail.size,
              publicUrl: fileDetail.location,
              creationDate: datetime
            });
            let result2 = await db
              .collection("files")
              .find({ userId: objId(data._id) })
              .toArray();
            res.json({
              status: "SUCCESS",
              data: result2,
            });
          } else {
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

filesRoute.get("/getAllFiles", authorize, async (req, res) => {
  try {
    let client = await mongoClient.connect(dbUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    let db = client.db("googledriveclone");
    let fileDetail = req.file;
    let userId = getUserId(req.headers.authorization);
    let data = await db.collection("users").findOne({ _id: objId(userId) });
    if (data) {
      let result2 = await db
        .collection("files")
        .find({ userId: objId(data._id) })
        .toArray();
      res.json({
        status: "SUCCESS",
        data: result2,
      });
    } else {
      res.json({ error: "ERROR", message: "Invalid User" });
    }
  } catch (e) {
    console.log(e);
    res.json({ status: "ERROR", message: "Something went wrong" });
  }
});



module.exports = filesRoute;
