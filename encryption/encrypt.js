import CryptoJS from 'crypto-js'

const encryptRequest = async (params) => {
    var ciphertext = CryptoJS.AES.encrypt(JSON.stringify(params), process.env.ENCRYPTION_SECRET).toString();
    console.log("encrypted text2", ciphertext);
    return ciphertext;
}

const decryptRequest = async (params) => {
    var bytes  = CryptoJS.AES.decrypt(params, process.env.ENCRYPTION_SECRET);
    var plaintext = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    console.log("decrypted text", plaintext);
    return plaintext;
}

const getTimestampwithdate = ()=> {
    var tempDate = new Date();
    var dateString = tempDate.getFullYear() + '-' + (tempDate.getMonth()+1) + '-' + tempDate.getDate() +' '+ tempDate.getHours()+':'+ tempDate.getMinutes()+':'+ tempDate.getSeconds();
    return dateString;
  }


export {encryptRequest, decryptRequest, getTimestampwithdate}; 