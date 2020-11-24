const jwt = require("jsonwebtoken");

function authorize(req, res, next) {
  if (req.headers.authorization != undefined) {
    jwt.verify(
      req.headers.authorization,
      process.env.JWT_KEY,
      (err, decode) => {
        if (err) throw err;
        if (decode) {
          next();
        } else {
          res.send("Invalid token");
        }
      }
    );
  } else {
    res.send("No token in the header");
  }
}

function allowUser(roles) {
  return function (req, res, next) {
    if(roles){ 
      roles.forEach( function (role) {
        if (req.role && req.role == role) {
          next();
        } else {
          res.status(403).json({
            message: "FORBIDDEN",
          });
        }
      });
  }
  };
}

module.exports = { authorize, allowUser };
