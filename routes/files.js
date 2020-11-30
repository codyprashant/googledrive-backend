const express = require("express");
const filesRoute = express.Router();
const mongoDB = require("mongodb");
const aws = require("aws-sdk");
const multerS3 = require("multer-s3");
const multer = require("multer");
const path = require("path");
const jwt_decode = require("jwt-decode");
const S3Sizer = require('aws-s3-size');

const s3 = new aws.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  Bucket: process.env.AWS_BUCKET_NAME,
  region: 'us-east-1'
});
console.log(s3)
const s3Sizer = new S3Sizer({s3 : s3});
console.log(s3Sizer)
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
          let data = await db.collection("users").findOne({ _id: objId(userId) });
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
            let result2 = await db.collection("files").find({ userId: objId(data._id) }).toArray();
            client.close();
            res.json({ status: "SUCCESS", data: result2, });
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

filesRoute.get("/getAllFiles", authorize, async (req, res) => {
  try {
    let client = await mongoClient.connect(dbUrl, {useNewUrlParser: true,useUnifiedTopology: true, });
    let db = client.db("googledriveclone");
    let userId = getUserId(req.headers.authorization);
    let data = await db.collection("users").findOne({ _id: objId(userId) });
    if (data) {
      let result2 = await db.collection("files").find({ userId: objId(data._id) }).toArray();
      client.close();
      res.json({ status: "SUCCESS", data: result2, });
    } else {
      client.close();
      res.json({ error: "ERROR", message: "Invalid User" });
    }
  } catch (e) {
    console.log(e);
    res.json({ status: "ERROR", message: "Something went wrong" });
  }
});

filesRoute.get("/gettotalStats", authorize, async (req, res) => {
  try {
    let client = await mongoClient.connect(dbUrl, { useNewUrlParser: true, useUnifiedTopology: true, });
    let db = client.db("googledriveclone");
    let userId = getUserId(req.headers.authorization);
    let data = await db.collection("users").findOne({ _id: objId(userId) });
    if (data) {
      let data2 = await db.collection("files").find({ userId: objId(userId) }).toArray();
      if (data2.length > 0) {
        await s3Sizer.getFolderSize(process.env.AWS_BUCKET_NAME, `${userId}/uploads`, async function(err, uploadsSize) {
          if(err){
            console.log(`Uploads Size: ${err}`);
            client.close();
            res.json({ status: "ERROR", message: "Something went wrong" });
          } else{
            await s3Sizer.getFolderSize(process.env.AWS_BUCKET_NAME, `${userId}/trash`, async function(err1, trashSize) {
              if(err1){
                console.log(`trash Size: ${err1}`);
                client.close();
                res.json({ status: "ERROR", message: "Something went wrong" });
              } else{
                await s3Sizer.getFolderSize(process.env.AWS_BUCKET_NAME, `${userId}/tempSpace`, async function(err2, tempSpaceSize) {
                  if(err2){
                    console.log(`tempspace Size: ${err2}`);
                    client.close();
                    res.json({ status: "ERROR", message: "Something went wrong" });
                  } else{
                    let result = await db.collection("users").findOneAndUpdate({ _id: objId(userId)}, { $set: { usedDriveSpace: uploadsSize, trashSpace: trashSize, tempSpace:tempSpaceSize } });
                    let final = await db.collection("users").findOne({ _id: objId(userId) });
                    client.close();
                    res.json({ status: "SUCCESS",  data: {usedSpace:final.usedDriveSpace ,allocated: final.allocatedSpace, trash: final.trashSpace, tempSpace: final.tempSpace, trashAllocate: final.trashAllocate, tempAllocate: final.tempAllocate } });
                  } 
                });
              } 
            });
          } 
        });
      } else{
        client.close();
        res.json({ status:"NOUPLOADS", message: "No Files Uploaded" });
      }
    } else {
      client.close();
      res.json({ error: "ERROR", message: "Invalid User" });
    }
  } catch (e) {
    console.log(e);
    res.json({ status: "ERROR", message: "Something went wrong" });
  }
});

filesRoute.post("/deleteFile", authorize, async (req, res) => {
  try {
    let client = await mongoClient.connect(dbUrl, { useNewUrlParser: true,  useUnifiedTopology: true, });
    let db = client.db("googledriveclone");
    let itemId = req.body.itemId;
    let userId = getUserId(req.headers.authorization);
    if (itemId) {
      let result2 = await db.collection("files").find({ _id: objId(itemId) }).toArray();
      var params = { 
        Bucket: process.env.AWS_BUCKET_NAME,
        CopySource: `${process.env.AWS_BUCKET_NAME}/${result2[0].s3FileName}`, 
        Key : `${result2[0].userId}/trash/${(result2[0].s3FileName).replace(`${result2[0].userId}/uploads/`, '')}`,
        ACL: 'public-read' 
      };
      await s3.copyObject(params, async function(err, data) {
        if (err){ 
          console.log(err, err.stack);
          client.close();
          res.json({ status: "ERROR", message: "Something went wrong, File not copied" });
        } 
        else{
          var params = { Bucket: process.env.AWS_BUCKET_NAME, Key: result2[0].s3FileName };
          await s3.deleteObject(params, async function(err1, data1) {
            if (err1){ 
              console.log(err1, err1.stack);
              client.close();
              res.json({ status: "ERROR", message: "Something went wrong, File not Deleted" });
            } 
            else{
              let deleteRes = await db.collection("files").deleteOne({ _id: objId(itemId) });
              var datetime = new Date()
              let result = await db.collection("trashFiles").insertOne({
                userId: objId(result2[0].userId),
                origfileName: result2[0].origfileName,
                s3FileName: `${result2[0].userId}/trash/${(result2[0].s3FileName).replace(`${result2[0].userId}/uploads/`, '')}`,
                bucketName: result2[0].bucketName,
                fileType: result2[0].fileType,
                fileSize: result2[0].fileSize,
                publicUrl: `${(result2[0].publicUrl).replace(`uploads`, 'trash')}`,
                creationDate: datetime
              });
             
              let newFiles = await db.collection("files").find({ userId: objId(result2[0].userId) }).toArray();
              client.close();
              res.json({ status: "SUCCESS", delStatus:deleteRes, message: "File Deleted Successfully", data:newFiles });
            }
          });
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

filesRoute.post("/deleteTrashFile", authorize, async (req, res) => {
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

module.exports = filesRoute;
