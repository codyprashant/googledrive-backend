const express = require("express");
const filesRoute = express.Router();
const mongoDB = require("mongodb");
const aws = require("aws-sdk");
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

const getUserId = (token) => {
  var decoded = jwt_decode(token);
  return decoded.userId;
};


filesRoute.get("/getAllTrashFiles", authorize, async (req, res) => {
  try {
    let client = await mongoClient.connect(dbUrl, { useNewUrlParser: true, useUnifiedTopology: true, });
    let db = client.db("googledriveclone");
    let userId = getUserId(req.headers.authorization);
    let data = await db.collection("users").findOne({ _id: objId(userId) });
    if (data) {
      let result2 = await db.collection("trashFiles").find({ userId: objId(data._id) }).toArray();
      client.close();
      res.json({ status: "SUCCESS",  data: result2, });
    } else {
      client.close();
      res.json({ error: "ERROR", message: "Invalid User" });
    }
  } catch (e) {
    console.log(e);
    res.json({ status: "ERROR", message: "Something went wrong" });
  }
});

filesRoute.post("/deleteTrashFile", authorize, async (req, res) => {
  try {
    let client = await mongoClient.connect(dbUrl, { useNewUrlParser: true, useUnifiedTopology: true, });
    let db = client.db("googledriveclone");
    let itemId = req.body.itemId;

    if (itemId) {
      let result2 = await db.collection("trashFiles").find({ _id: objId(itemId) }).toArray();
      var params = { Bucket: process.env.AWS_BUCKET_NAME, Key: result2[0].s3FileName };
      await s3.deleteObject(params, async function(err, data) {
        if (err){ 
          console.log(err, err.stack);
          client.close();
          res.json({ status: "ERROR", message: "Something went wrong, File not Deleted" });
        } 
        else{
          let deleteRes = await db.collection("trashFiles").deleteOne({ _id: objId(itemId) });
          let newFiles = await db.collection("trashFiles").find({ userId: objId(result2[0].userId) }).toArray();
          client.close();
          res.json({ status: "SUCCESS",  message: "File Deleted Successfully", data:newFiles });
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


filesRoute.post("/restoreFile", authorize, async (req, res) => {
    try {
      let client = await mongoClient.connect(dbUrl, {  useNewUrlParser: true,   useUnifiedTopology: true,  });
      let db = client.db("googledriveclone");
      let itemId = req.body.itemId;
      let userId = getUserId(req.headers.authorization);
      if (itemId) {
        let result2 = await db.collection("trashFiles").find({ _id: objId(itemId) }).toArray();

        var params = { 
          Bucket: process.env.AWS_BUCKET_NAME,
          CopySource: `${process.env.AWS_BUCKET_NAME}/${result2[0].s3FileName}`, 
          Key : `${result2[0].userId}/uploads/${(result2[0].s3FileName).replace(`${result2[0].userId}/trash/`, '')}`,
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
                let deleteRes = await db.collection("trashFiles").deleteOne({ _id: objId(itemId) });
                var datetime = new Date()
                let result = await db.collection("files").insertOne({
                  userId: objId(result2[0].userId),
                  origfileName: result2[0].origfileName,
                  s3FileName: `${result2[0].userId}/uploads/${(result2[0].s3FileName).replace(`${result2[0].userId}/trash/`, '')}`,
                  bucketName: result2[0].bucketName,
                  fileType: result2[0].fileType,
                  fileSize: result2[0].fileSize,
                  publicUrl: `${(result2[0].publicUrl).replace(`trash`, 'uploads')}`,
                  creationDate: datetime
                });
               
                let newFiles = await db.collection("trashFiles").find({ userId: objId(result2[0].userId) }).toArray();
                client.close();
                res.json({ status: "SUCCESS",  message: "File Deleted Successfully", data:newFiles });
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








module.exports = filesRoute;
