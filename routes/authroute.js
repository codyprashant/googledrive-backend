const express = require("express");
const authRoute = express.Router();
const mongoDB = require("mongodb");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const randomstring = require("randomstring");
const nodemailer = require("nodemailer");
const {  encryptRequest,  decryptRequest } = require("../encryption/encrypt");
const mongoClient = mongoDB.MongoClient;
const objId = mongoDB.ObjectID;
const dbUrl = process.env.DB_URL ;

authRoute.post("/register", async (req, res) => {
  try {
    let client = await mongoClient.connect(dbUrl, {useNewUrlParser: true, useUnifiedTopology: true});
    let db = client.db("googledriveclone");
    let newuser = req.body;
    let data = await db.collection("users").findOne({ email: newuser.email });
    if (data) {
      res.status(203).json({ message: "User already Registered" });
    } else {
      let salt = await bcrypt.genSalt(12);
      let hash = await bcrypt.hash(newuser.password, salt);
      newuser.password = hash;
      newuser.activationCode = randomstring.generate();
      newuser.status = "INACTIVE";
      let result = await db.collection("users").insertOne(newuser);
      let encryptedDet = await encryptRequest({email: newuser.email, activationCode: newuser.activationCode})
      sendEmail(newuser.email,encryptedDet, 'NEWACCOUNT')
      res.status(200).json({status:"SUCCESS", message:"Registered successfully, Please check Your Email to Verify your account" });
      client.close();
    }
  } catch (err) {
    console.log(err);
    res.status(204).json({ message: "Something went wrong. Please try again after sometime." });
  }
});

authRoute.post("/login", async (req, res) => {
  try {
    let client = await mongoClient.connect(dbUrl, {useNewUrlParser: true, useUnifiedTopology: true});
    let db = client.db("googledriveclone");
    let data = await db.collection("users").findOne({ email: req.body.email });
    if (data) {
      if (data.status == "ACTIVE") {
        let isValid = await bcrypt.compare(req.body.password, data.password);
        if (isValid) {
          let token = await jwt.sign(
            { userId: data._id },
            process.env.JWT_KEY,
            {
              expiresIn: "1h",
            }
          );
          res.status(200).json({
            status:"SUCCESS",
            message: "login success",
            token,
            userData:{ Fname: data.firstName, Lname:data.lastName, email:data.email}
          });
        } else {
          res.status(203).json({
            message: "Incorrect Password",
          });
        }
      } else {
        res.status(203).json({
          message: "User account is not activated. Please activate the account using verification email",
        });
      }
    } else {
      res.status(203).json({
        status: "ERROR",
        message: "Email is not registered",
      });
    }
    client.close();
  } catch (error) {
    console.log(error);
    res.status(204).json({
        status: "ERROR",
        message: "We are having some trouble authorizing, Please reach out to Administrator",
      });
  }
});


authRoute.post("/verifyaccount/", async (req, res) => {
    try {
      let client = await mongoClient.connect(dbUrl, {useNewUrlParser: true, useUnifiedTopology: true});
      let db = client.db("googledriveclone");
      let reqData = await decryptRequest(req.body.encryptedText)
      // if(!reqData) res.status(203).json({ status:"ERROR", message: "Invalid Url and User Verification" });
      let data = await db
        .collection("users")
        .findOne({ email: reqData.email });
      if (!data) {
        res.status(203).json({ status:"ERROR", message: "Invalid Url and User Verification" });
      } else {
          if(data.status =='INACTIVE'){
              if(data.activationCode == reqData.activationCode){
                let result = await db.collection("users").findOneAndUpdate({ _id: data._id }, { $set: { status: 'ACTIVE', activationCode:'' } });
                res.status(200).json({ status:"SUCCESS", message: "User Activated successfully" });
                client.close();
              } else{
                res.status(203).json({ status:"ERROR", message: "Invalid URL with code" });
              }
          } else{
            res.status(203).json({ status:"ERROR", message: "Account is already activated" });
          }
      }
    } catch (err) {
      console.log(err);
      res.status(204).json({ status:"ERROR", message: "Invalid URL" });
    }
  });


  authRoute.post("/resetRequest/", async (req, res) => {
    try {
      let client = await mongoClient.connect(dbUrl, {useNewUrlParser: true, useUnifiedTopology: true});
      let db = client.db("googledriveclone");
      let data = await db
        .collection("users")
        .findOne({ email: req.body.email });
      if (!data) {
        res.status(203).json({ message: "Email not Registered" });
      } else {
          if(data.status =='ACTIVE'){
                let genCode = randomstring.generate();
                let result = await db.collection("users").findOneAndUpdate({ _id: data._id }, { $set: { code: genCode } });
                let encryptedDet = await encryptRequest({email: req.body.email, code: genCode})
                sendEmail(req.body.email,encryptedDet, 'PASSWORDRESET') 
                res.status(200).json({ status:"SUCCESS", message: "Password Reset Email Sent" });
                client.close();
           
          } else{
            res.status(203).json({ status:"ERROR", message: "Account is not active activated. Please check your email to verify your email" });
          }
      }
    } catch (err) {
      console.log(err);
      res.status(204).json({ status:"ERROR", message: "Something went wrong" });
    }
  });

  authRoute.post("/resetPassword", async (req, res) => {
    try {
      let client = await mongoClient.connect(dbUrl, {useNewUrlParser: true, useUnifiedTopology: true});
      let db = client.db("googledriveclone");
      let reqData = await decryptRequest(req.body.encryptedText)
      if(!reqData) res.status(203).json({ status:"ERROR", message: "Invalid Url" });
      let data = await db
        .collection("users")
        .findOne({ email: reqData.email });
      if (!data) {
        res.status(203).json({ message: "Email not Registered" });
      } else {
          if(data.status =='ACTIVE'){
            let salt = await bcrypt.genSalt(12);
            let hash = await bcrypt.hash(req.body.password, salt);
            let result = await db.collection("users").findOneAndUpdate({ _id: data._id }, { $set: { code: '', password: hash } });          
            res.status(200).json({status:"SUCCESS", message: "Password  successfully changed, Please Login again"  });
            client.close();
          } else{
            res.status(203).json({ status:"ERROR", message: "Account is not active activated. Please check your email to verify your email" });
          }
      }
    } catch (err) {
      console.log(err);
      res.status(204).json({ status:"ERROR", message: "Something went wrong" });
    }
  });

  authRoute.post("/passwordRequestVerify/", async (req, res) => {
    try {
      let client = await mongoClient.connect(dbUrl, {useNewUrlParser: true, useUnifiedTopology: true});
      let db = client.db("googledriveclone");
      let reqData = await decryptRequest(req.body.encryptedText)
      if(!reqData) res.status(203).json({ status:"ERROR", message: "Invalid Url" });
      let data = await db
        .collection("users")
        .findOne({ email: reqData.email });
      if (!data) {
        res.status(203).json({ status:"ERROR", message: "Invalid Url and User Verification" });
      } else {
          if(data.status =='ACTIVE'){
              if(data.code == reqData.code){
                let result = await db.collection("users").findOneAndUpdate({ _id: data._id }, { $set: { status: 'ACTIVE'} });
                res.status(200).json({ status:"SUCCESS", message: "REquest Verified" });
                client.close();
              } else{
                res.status(203).json({ status:"ERROR", message: "Invalid URL with code" });
              }
          } else{
            res.status(203).json({ status:"ERROR", message: "Account is INACTIVE" });
          }
      }
    } catch (err) {
      console.log(err);
      res.status(204).json({ status:"ERROR", message: "Invalid URL" });
    }
  });


async function sendEmail(userEmail, encryptText, purpose) {
  
    // create reusable transporter object using the default SMTP transport
    let transporter = nodemailer.createTransport({
        // service: "Gmail",
        host: 'mail.zaiffly.com',
        port: 465,
         // true for 465, false for other ports
        auth: {
            user: process.env.EMAIL,
            pass: process.env.PASSWORD
        }
    });
  
    if(purpose == 'NEWACCOUNT'){
    var message = `Your account has been created successfully. Please verify your account by clicking below URL
                        <a href="${process.env.FRONTEND_URL}/pages/auth/unlockUser/${encryptText}"> Verify our Account</a>`

    var mailOptions = {
        from: process.env.EMAIL,
        to: userEmail, 
        subject: 'Verify your Email Address',
        html: message
    }
    
    await transporter.sendMail(mailOptions, function(error, response){
        if(error){
            console.log(error);
        }
        if(response){
          return true;
        } else{
          return false;
        }
        
    });
}

else if(purpose == 'PASSWORDRESET'){
  var message = `You have raised password reset request. Please click on below URL to reset Password
  <a href="${process.env.FRONTEND_URL}/pages/auth/resetPwd/${encryptText}"> Verify our Account</a>`
  var mailOptions = {
      from: process.env.EMAIL,
      to: userEmail, 
      subject: 'Password Reset',
      html: message
  }
  
  await transporter.sendMail(mailOptions, function(error, response){
      if(error){
          console.log(error);
      }
      if(response){
        return true;
      } else{
        return false;
      }
      
  });
}

  }

  module.exports = authRoute; 