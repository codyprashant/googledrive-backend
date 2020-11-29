// import CryptoJS from ''
const CryptoJS = require("crypto-js");
const base64 = require('base-64');

const encryptRequest = async (params) => {
  try {
    var ciphertext = CryptoJS.TripleDES.encrypt(JSON.stringify(params), process.env.ENCRYPTION_SECRET).toString();
    let baseCipher = base64.encode(ciphertext)
    return baseCipher;
  } catch (e) {
    return false;
  }
};

const decryptRequest = async (params) => {
  try {
    let baseCipher = base64.decode(params);
    var bytes = CryptoJS.TripleDES.decrypt(
      baseCipher,
      process.env.ENCRYPTION_SECRET
    );
    var plaintext = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    return plaintext;
  } catch (e) {
    return false;
  }
};

const getTimestampwithdate = () => {
  var tempDate = new Date();
  var dateString =
    tempDate.getFullYear() +
    "-" +
    (tempDate.getMonth() + 1) +
    "-" +
    tempDate.getDate() +
    " " +
    tempDate.getHours() +
    ":" +
    tempDate.getMinutes() +
    ":" +
    tempDate.getSeconds();
  return dateString;
};

module.exports = { encryptRequest, decryptRequest, getTimestampwithdate };
