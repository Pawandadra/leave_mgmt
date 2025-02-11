const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const verifyDepartment = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  console.log(req.headers);
  console.log("token = ", token);

  if (!token)
    res
      .status(401)
      .json({ error: "Unauthorized to access the requested resources." });

  try {
    const verified = jwt.verify(token, process.env.SESSION_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    console.error(err);
    return res
      .status(400)
      .json({ error: "Verification Failed, Invalid token." });
  }
};

module.exports = verifyDepartment;
