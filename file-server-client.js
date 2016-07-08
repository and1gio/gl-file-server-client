var http = require('http');
var request = require('request');
var error = require('gl-clients-error-codes');

request.debug = false;

var Manager = function (config) {
    this.config = config;
    this.resolutions = {};
};

var manager = Manager.prototype;

manager.get = function (method, data, cb) {
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
        cb(error('CONNECTION_ERROR', e), null);
    });
    req.write(postData);
    req.end();
};

manager.send = function (method, data, cb) {
    var me = this;
    var conf = me.config;
    var ApiUrl = "http://" + conf.host + ":" + conf.port + conf.path + method;
    var reqObj = {url: ApiUrl, formData: data};
    request.post(reqObj, function (error, response, body) {
        me.handleSendResponse(error, response, body, cb);
    });
};

manager.handleSendResponse = function (fnError, response, body, callback) {
    var me = this;
    if (fnError) {
        return callback(error('CONNECTION_ERROR', fnError), null);
    }
    var respBody = JSON.parse(body);
    if (!respBody || !respBody.result) {
        return callback(error('CONNECTION_ERROR', {message: "response body is null"}), null);
    }
    if (respBody.error) {
        return callback(respBody.error, null);
    }
    callback(null, respBody.result.data);
};

manager.saveFile = function (stream, key, cb) {
    var me = this;
    var callBack;
    var keyWord;

    if (!cb) {
        callBack = key;
        keyWord = me.config.key;
    } else {
        callBack = cb;
        keyWord = key;
    }

    var p = {
        file: stream
    };

    if (keyWord) {
        p.key = keyWord;
    }

    me.send("FilesSaveFile", p, function (err, res) {
        return callBack(err, res);
    });
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
    me.get("FilesGetFile", p, function (err, res) {
        return cb(err, res);
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
        return cb(error('RESOLUTION_NOT_PERMITTED', null), null);
    }

    if (options.crop && !me.supportedCrops[options.crop]) {
        return cb(error('UNSUPPORTED_CROP_PLACEMENT', null), null);
    }

    for (var i in options) {
        p[i] = options[i];
    }

    me.get("FilesGetImage", p, function (err, res) {
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