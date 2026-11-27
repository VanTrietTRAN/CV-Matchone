const mongoose = require('mongoose');

/**
 * router.param cho các tham số là ObjectId (:id, :companyUserId).
 *
 * Id sai định dạng trước đây rơi xuống Mongoose và trả 500 kèm CastError
 * ("Cast to ObjectId failed ... for model Job") — vừa sai mã lỗi vừa lộ tên
 * model. Nay chặn ngay ở router và trả 400.
 */
const validateObjectIdParam = (req, res, next, value) => {
  if (!mongoose.isValidObjectId(value) || String(value).length !== 24) {
    return res.status(400).json({ message: 'Mã định danh không hợp lệ.' });
  }
  return next();
};

module.exports = { validateObjectIdParam };
