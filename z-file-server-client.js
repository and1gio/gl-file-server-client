// TODO have to replace with z-api-request-helper
var http = require('http');
var request = require('request');
var fs = require("fs");
// TODO end

// TODO this must be set by config
request.debug = false;

var Manager = function (config) {
    this.config = config;
    this.resolutions = {};
};

var manager = Manager.prototype;

manager.getFileStream = function (method, data, cb) {
    var me = this;
    var conf = me.config;
    var postData = JSON.stringify(data);
    var options = {
        hostname: conf.host,
        port: conf.port,
        path: conf.path + method,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    var req = http.request(options, function (res) {
        if (res.statusCode !== 200) {
            var data = "";
            res.on('data', function (chunk) {
                data += chunk;
            });
            res.on('end', function () {
                cb(JSON.parse(data).error, null);
            });
            return;
        }
        cb(null, {stream: res});
    });

    req.on('error', function (e) {
        cb([{keyword: 'CONNECTION_ERROR', error: e}], null);
    });
    req.write(postData);
    req.end();
};

manager.send = function (method, data, cb) {
    var me = this;
    var conf = me.config;
    var apiUrl = "http://" + conf.host + ":" + conf.port + conf.path + method;

    var reqObj = {url: apiUrl, formData: data};
    request.post(reqObj, function (error, response, body) {
        me.handleFormDataResponse(error, response, body, cb);
    });
};

manager.post = function (method, data, cb) {
    var me = this;
    var conf = me.config;
    var apiUrl = "http://" + conf.host + ":" + conf.port + conf.path + method;

    var reqObj = {url: apiUrl, json: data};
    request.post(reqObj, function (error, response, body) {
        me.handleJsonResponse(error, response, body, cb);
    });
};

manager.handleFormDataResponse = function (fnError, response, body, callback) {
    var me = this;

    if (fnError) {
        return callback([{keyword: 'CONNECTION_ERROR', error: fnError}], null);
    }

    var respBody = JSON.parse(body);

    if (!respBody || !respBody.result) {
        return callback([{keyword: 'CONNECTION_ERROR', error: {message: "response body is null"}}], null);
    }

    if (respBody.result.error) {
        return callback(respBody.result.error, null);
    }

    callback(null, respBody.result.data);
};

manager.handleJsonResponse = function (fnError, response, body, callback) {
    var me = this;

    if (fnError) {
        return callback([{keyword: 'CONNECTION_ERROR', error: fnError}], null);
    }

    var respBody = body;

    if (!respBody || !respBody.result) {
        return callback([{keyword: 'CONNECTION_ERROR', error: {message: "response body is null"}}], null);
    }

    if (respBody.result.error) {
        return callback(respBody.result.error, null);
    }

    callback(null, respBody.result.data);
};

manager.saveStream = function (stream, key, metadata, cb) {
    var me = this;
    var callback = cb;
    var keyword = key || me.config.key;

    var p = {
        file: stream
    };

    if (metadata.originalName) {
        p.originalName = metadata.originalName;
    }

    if (metadata.mimeType) {
        p.mimeType = metadata.mimeType;
    }

    if (metadata.size) {
        p.size = metadata.size;
    }

    if (keyword) {
        p.key = keyword;
    }

    me.send("file/save", p, function (err, res) {
        return callback(err, res);
    });
};

manager.saveFile = function (file, key, cb) {
    var me = this;
    var callback = cb;
    var keyword = key || me.config.key;

    var stream = fs.createReadStream(file.path);

    var p = {
        file: stream
    };

    if (file.originalname) {
        p.originalName = file.originalname;
    }

    if (file.mimetype) {
        p.mimeType = file.mimetype;
    }

    if (file.size) {
        p.size = file.size;
    }

    if (keyword) {
        p.key = keyword;
    }

    me.send("file/save", p, function (err, res) {
        return callback(err, res);
    });

    fs.unlinkSync(file.path);
};

manager.getFile = function (fileConf, cb) {
    var me = this;
    var p = {};

    if (typeof fileConf === "string") {
        p.fileId = fileConf;
        p.key = me.config.key;
    } else {
        p.fileId = fileConf.fileId;
        p.key = fileConf.key || me.config.key;
    }

    me.post("file/get/meta", p, function (err, metaData) {
        if(err){
            return cb([{keyword: 'FAILED_TO_GET_FILE_META_INFO'}], null);
        }
        me.getFileStream("file/get", p, function (err, res) {
            if(err){
                return cb([{keyword: 'FAILED_TO_GET_FILE_FROM_STORAGE'}], null);
            }
            return cb(null, {stream: res.stream, metaData: metaData});
        });
    });
};

manager.getImage = function (fileConf, options, cb) {
    var me = this;
    var p = {};

    if (typeof fileConf === "string") {
        p.fileId = fileConf;
        p.key = me.config.key;
    } else {
        p.fileId = fileConf.fileId;
        p.key = fileConf.key || me.config.key;
    }

    if ((options.width || options.height) && !me.isResolutionPermitted(options.width, options.height)) {
        return cb([{keyword: 'RESOLUTION_NOT_PERMITTED'}], null);
    }

    if (options.crop && !me.supportedCrops[options.crop]) {
        return cb([{keyword: 'UNSUPPORTED_CROP_PLACEMENT'}], null);
    }

    for (var i in options) {
        p[i] = options[i];
    }

    me.getFileStream("file/get/image", p, function (err, res) {
        return cb(err, res);
    });
};

manager.addPermittedResolution = function (width, height) {
    var me = this;
    if (!width) {
        width = 0;
    }
    if (!height) {
        height = 0;
    }
    if (!me.resolutions[width]) {
        me.resolutions[width] = {};
    }
    me.resolutions[width][height] = true;
};

manager.isResolutionPermitted = function (width, height) {
    var me = this;

    if (!width) {
        width = 0;
    }

    if (!height) {
        height = 0;
    }

    if (!me.resolutions[width]) {
        return false;
    }

    if (!me.resolutions[width][height]) {
        return false;
    }

    return true;
};

manager.supportedCrops = {
    "TL": true,
    "TC": true,
    "TR": true,
    "ML": true,
    "MC": true,
    "MR": true,
    "BL": true,
    "BC": true,
    "BR": true
};

module.exports = Manager;