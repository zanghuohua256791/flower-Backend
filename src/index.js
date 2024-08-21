const express = require("express"); //引入express 模块
const app = express(); //创建实例
const mysql = require("mysql"); //引入mysql 模块
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

// 设置Multer存储配置
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/images");
  },
  filename: function (req, file, cb) {
    let imgesori = Buffer.from(file.originalname, "latin1").toString("utf8"), // 图片名称
      radname =
        Date.now() +
        parseInt(Math.random() * 999) +
        parseInt(Math.random() * 666), // 赋给图片的名称用时间戳+随机数获取
      extension = imgesori.substring(imgesori.lastIndexOf(".")), // 获取图片的后缀名
      name = radname + extension; // 最终图片名称
    cb(null, name);
  },
});

const upload = multer({ storage: storage });
app.use(bodyParser.json()); //用于req.body获取值的

function uuid() {
  var s = [];
  var hexDigits = "0123456789abcdef";
  for (var i = 0; i < 36; i++) {
    s[i] = hexDigits.substr(Math.floor(Math.random() * 16), 1);
  }
  s[14] = "4";
  s[19] = hexDigits.substr((s[19] & 3) | 8, 1);
  s[8] = s[13] = s[18] = s[23] = "-";
  return s.join("");
}
// 创建数据库连接 填入数据库信息
//填自己数据库的信息!!!!!!!!!!!
const conn = mysql.createConnection({
  user: "root", //用户名
  password: "123456", //密码
  host: "192.168.4.50", //主机（默认都是local host）
  database: "flower", //数据库名
});
const Control = "/api/flowerInfo";
// 测试连接
conn.connect((err) => {
  console.log(err);
});
// 查询接口
app.get(`${Control}/list`, (req, res) => {
  let pageIndex = parseInt(req.query?.pageIndex) || 0,
    pageSize = parseInt(req.query?.pageSize) || null,
    { fname, fsituation } = req.query;
  (sqlStr = `select * from flowerinfo WHERE fname like'%${fname}%' AND fsituation like '%${fsituation}%' ORDER BY fid Limit ${
    pageIndex * pageSize
  },${pageSize}`),
    (sqlCountStr = `SELECT COUNT(*) from flowerinfo WHERE fname like'%${fname}%' AND fsituation like '%${fsituation}%'`);
  conn.query(sqlStr, (err, result) => {
    if (err) throw err;
    conn.query(sqlCountStr, (countErr, count) => {
      if (countErr) throw countErr;
      return res.send({
        count: count[0]["COUNT(*)"],
        data: result.map((e) => {
          return {
            ...e,
            fImages: e.fImages ? JSON.parse(e.fImages) : [],
          };
        }),
      });
    });
  });
});
// 新增接口
app.post(`${Control}/addOrUpdate`, (req, res) => {
  const { fid, fname, fprice, fsituation, fuse, fhc, fword } = req.body;
  let sqlStr = fid
    ? `update flowerinfo set fname='${fname}',fprice='${fprice}',fsituation='${fsituation}',fuse='${fuse}',fhc='${fhc}',fword='${fword}' where fid='${fid}'`
    : `insert into flowerinfo (fname,fprice,fsituation,fuse,fhc,fword) values ('${fname}','${fprice}','${fsituation}','${fuse}','${fhc}', '${fword}')`;
  conn.query(sqlStr, (err, result) => {
    if (err) throw err;
    return res.send(true);
  });
});
// 删除接口
app.post(`${Control}/delete`, async (req, res) => {
  let sqlStr = `delete from flowerinfo where fid='${req.body.id}'`;
  // 删除数据前将存储的图片删除
  let filesArr = await getImagesById(req.body.id)
  filesArr.forEach(async (file) => {
    fs.unlinkSync(path.join(__dirname, file.url));
  })
  conn.query(sqlStr, (err, result) => {
    if (err) res.status(500).send(err);
    return res.send(true);
  });
});
// 上传多个附件接口
app.post(`${Control}/uploads`, upload.array("file", 999), async (req, res) => {
  const associateId = req.body.associateId;
  console.log("req.files", req.files);
  let files = req.files,
    uploadFiles = [];
  files.forEach(async (file) => {
    // // 解决中文乱码问题
    let imgesori = Buffer.from(file.originalname, "latin1").toString("utf8"), // 图片名称
      extension = imgesori.substring(imgesori.lastIndexOf(".")); // 获取图片的后缀名
    uploadFiles.push({
      fileId: uuid(),
      url: `/public/images/${file.filename}`,
      name: imgesori,
      size: file.size,
      extension,
    });
  });
  let filesArr = await getImagesById(associateId);
  let tempArr = [...filesArr, ...uploadFiles];
  let sqlStr = `UPDATE flowerinfo SET fImages = '${JSON.stringify(
    tempArr
  )}' WhERE fid ='${associateId}'`;
  conn.query(sqlStr, (err) => {
    if (err) throw err;
    return res.send({ code: 200, msg: "图片上传成功", data: tempArr });
  });
});
// 根据主键id查询图片
const getImagesById = (id) => {
  return new Promise((resolve, reject) => {
    conn.query(
      `select fImages from flowerinfo WHERE fid ='${id}'`,
      (err, result) => {
        if (err) {
          reject(err);
        } else {
          let filesArr = result[0].fImages ? JSON.parse(result[0].fImages) : [];
          resolve(filesArr);
        }
      }
    );
  });
};
// 删除附件接口
app.post(`${Control}/deleteFile`, async (req, res) => {
  let id = req.body.fid,
    filesArr = await getImagesById(id),
    index = filesArr.findIndex((item) => item.fileId === req.body.fileId),
    delObj = filesArr.splice(index, 1);
  let sqlStr = `UPDATE flowerinfo SET fImages = '${JSON.stringify(
    filesArr
  )}' WHERE fid ='${id}'`;
  conn.query(sqlStr, (err, result) => {
    if (err) throw err;
    // 删除文件夹中的图片
    fs.unlinkSync(path.join(__dirname, delObj[0].url));
    return res.send({ code: 200, msg: "删除成功", data: filesArr });
  });
});
// 静态文件中间件，用于提供上传的文件
app.use("/public", express.static("public"));
// 去除接口302
app.disable("etag");
// 开启服务器
let server = app.listen(3578, () => {
  let port = server.address().port;
  console.log(`Example app listening at http://localhost:${port}`);
});
